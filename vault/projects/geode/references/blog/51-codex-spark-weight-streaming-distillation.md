---
title: "GPT-5.3-Codex-Spark 딥 다이브 — 하드웨어 코어부터 Distillation 파이프라인까지"
type: reference
category: blog-post
tags: [blog, harness-frontier]
source: "blog/posts/harness-frontier/51-codex-spark-weight-streaming-distillation.md"
created: 2026-04-08T00:00:00Z
---

# GPT-5.3-Codex-Spark 딥 다이브 — 하드웨어 코어부터 Distillation 파이프라인까지

> Date: 2026-03-24 | Author: rooftopsnow | Tags: codex-spark, cerebras, wse-3, weight-streaming, distillation, quantization, inference, hardware-codesign

---

## 목차

1. 도입: 1,000 tok/s는 어디서 오는가
2. LLM 추론의 본질적 병목 — Memory-Bound 문제
3. Cerebras WSE-3 — 웨이퍼 위에 메모리를 올리다
4. Weight Streaming — 레이어 단위 가중치 흐름
5. MemoryX + SwarmX — 클러스터 수준 아키텍처
6. Prefill-Decode 분리와 Speculative Decoding
7. Distillation 파이프라인 — Teacher에서 Student로
8. Quantization — 정밀도 깎기
9. Pruning — 구조적 가지치기
10. Hardware Mapping — WSE-3에 최종 배치
11. 마무리

---

## 1. 도입: 1,000 tok/s는 어디서 오는가

GPT-5.3-Codex-Spark(이하 Spark)는 2026년 3월 OpenAI가 Cerebras와 협업하여 출시한 코딩 특화 모델입니다. 핵심 스펙은 두 가지입니다:

- **1,000+ tok/s** 추론 속도 (GPT-5.3-Codex 대비 ~15배)
- **SWE-Bench Pro 56%** (풀사이즈 72% 대비 -16%p)

속도와 품질을 맞교환한 모델입니다. 그런데 이 속도가 단순히 "작은 모델이니까 빠르다"로 설명되지 않습니다. 동급 파라미터의 GPU 추론 모델은 이 속도에 근접하지 못합니다. Spark의 속도는 **하드웨어 아키텍처(Cerebras WSE-3)**와 **모델 압축(Distillation + Quantization + Pruning)**의 수직 통합에서 나옵니다.

이 글에서는 실리콘 물리 수준부터 Distillation 파이프라인까지, 1,000 tok/s를 가능하게 한 기술 스택을 레이어별로 분해합니다.

---

## 2. LLM 추론의 본질적 병목 — Memory-Bound 문제

LLM 추론이 느린 이유는 연산이 부족해서가 아닙니다. **메모리 대역폭이 부족해서**입니다.

Roofline 분석으로 보면 Transformer의 Decode(토큰 생성) 단계는 Memory Bandwidth Wall 아래에 갇혀 있습니다.

```
                  ┌─────────────────────────────────────┐
 FLOPS/s          │          Compute Ceiling             │
  (성능)          │  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
                  │         /                            │
                  │        / ← Memory Bandwidth Wall     │
                  │       /                              │
                  │      /   ★ LLM Decode (여기 갇힘)     │
                  │     /                                │
                  │    /                                 │
                  └────┴────────────────────────────────┘
                        Arithmetic Intensity (FLOP/byte)
```

Transformer 추론은 두 단계로 나뉩니다:

| 단계 | 성격 | 병목 |
|---|---|---|
| Prefill (프롬프트 처리) | 병렬 가능, 연산 집약적 | Compute-bound |
| Decode (토큰 생성) | 순차적, 한 번에 1토큰 | Memory bandwidth-bound |

Decode 단계에서 매 토큰마다 **모델 전체 가중치를 메모리에서 읽어야** 합니다. 70B 모델(FP16)이면 매 토큰에 140GB를 읽는 셈입니다. H100의 HBM3 대역폭이 3.35TB/s이니, 이론상 한계가 ~24 tok/s입니다.

KV Cache(Key-Value Cache)까지 더하면 상황이 악화됩니다:

- KV Cache는 컨텍스트 길이에 비례하여 선형 증가
- Attention 연산은 MHA(Multi-Head Attention)/GQA(Grouped-Query Attention) 모두 memory-bound 영역에 머무름
- 배치 크기를 키워도 KV Cache 메모리가 HBM을 잠식

> GPU 클러스터의 문제는 연산 능력이 아닙니다. 가중치와 KV Cache를 HBM에서 GPU 코어로 옮기는 **대역폭**이 병목입니다. Cerebras는 이 병목을 실리콘 수준에서 제거합니다.

---

## 3. Cerebras WSE-3 — 웨이퍼 위에 메모리를 올리다

### 3.1 Processing Element 마이크로아키텍처

WSE-3(Wafer-Scale Engine 3)의 900,000개 코어 각각은 독립적인 PE(Processing Element)입니다:

```
┌────────────────────────────────────────────┐
│              Processing Element (PE)        │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  Compute Engine (CE)                  │  │
│  │  ─ FP32, FP16, INT16 벡터 연산        │  │
│  │  ─ 텐서 최적화 명령어 세트             │  │
│  └──────────┬───────────────────────────┘  │
│             │                              │
│  ┌──────────▼───────────────────────────┐  │
│  │  Local SRAM: 48 KB                    │  │
│  │  ─ 8 banks × 6 KB/bank               │  │
│  │  ─ 1-cycle read/write latency ← 핵심  │  │
│  │  ─ 2 reads + 1 write per cycle        │  │
│  └──────────┬───────────────────────────┘  │
│             │                              │
│  ┌──────────▼───────────────────────────┐  │
│  │  Router (4방향 + CE)                  │  │
│  │  N ↑                                  │  │
│  │  W ←── PE ──→ E                       │  │
│  │  S ↓                                  │  │
│  │  ─ PE간 통신 지연: 1 cycle             │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```

**48KB × 900,000 코어 = 44GB 온칩 SRAM** — 이것이 WSE-3의 총 온칩 메모리입니다.

### 3.2 2D Mesh 통신 패브릭

900,000개 PE가 2D 직사각형 메시로 연결됩니다. 21.5cm × 21.5cm 웨이퍼 전체가 하나의 칩입니다.

통신 메커니즘:

| 요소 | 설명 |
|---|---|
| Wavelet | 32-bit 메시지 단위, PE간 수 클럭 사이클에 전송 |
| Color | 가상 채널, wavelet이 이동하는 경로 |
| Dataflow | 데이터 도착이 연산을 트리거 (비동기 태스크 모델) |
| 주입 대역폭 | 코어당 사이클당 16 bytes |
| 총 패브릭 대역폭 | **214 Pb/s** |

### 3.3 GPU 대비 메모리 계층 비교

```
GPU (H100):                          Cerebras WSE-3:

┌─────────┐                          ┌─────────────────────────┐
│ L1/L2   │ ~수 MB, ~50 TB/s        │ 44 GB SRAM (온칩)       │
├─────────┤                          │ 21 PB/s 대역폭          │
│ HBM3    │ 80 GB, 3.35 TB/s        │ (단일 메모리 계층!)       │
├─────────┤                          └───────────┬─────────────┘
│ NVLink  │ 노드간, 900 GB/s                     │
├─────────┤                          ┌───────────▼─────────────┐
│InfiniBand│ 랙간, 400 Gb/s          │ MemoryX (외부)          │
└─────────┘                          │ 최대 2.4 PB             │
                                     └─────────────────────────┘
```

GPU는 4-5단계 메모리 계층을 거치지만, WSE-3는 사실상 **2단계**(온칩 SRAM + MemoryX)입니다. SRAM의 접근 지연은 HBM 대비 ~100배 낮고, 대역폭은 ~6,000배 높습니다. 이 물리적 차이가 속도의 근간입니다.

---

## 4. Weight Streaming — 레이어 단위 가중치 흐름

모델이 44GB SRAM에 통째로 들어가면 최고지만, 프론티어 모델은 들어가지 않습니다. 이때 **Weight Streaming**이 작동합니다.

### 작동 원리

```
시간 →

MemoryX:  [Layer 0 weights] [Layer 1 weights] [Layer 2 weights] ...
              │                    │                   │
              ▼                    ▼                   ▼
WSE-3:    ┌─────────┐        ┌─────────┐        ┌─────────┐
          │Layer 0  │        │Layer 1  │        │Layer 2  │
          │연산 수행 │   →    │연산 수행 │   →    │연산 수행 │
          │가중치 폐기│        │가중치 폐기│        │가중치 폐기│
          └─────────┘        └─────────┘        └─────────┘
              │                    │                   │
              ▼                    ▼                   ▼
          Activations         Activations         Activations
          (SRAM 상주)         (SRAM 상주)         (SRAM 상주)
```

핵심 메커니즘:

1. 한 번에 한 레이어의 가중치만 MemoryX에서 WSE-3로 스트리밍
2. 가중치가 도착하면 개별 AXPY 연산으로 즉시 처리
3. 처리 완료된 가중치는 **즉시 폐기** — SRAM에 저장하지 않음
4. Activations(활성화)만 SRAM에 상주 — 레이어 간 전달용
5. 다음 레이어 가중치가 스트리밍되어 반복

> 전통적 GPU 접근에서는 모델이 HBM에 안 들어가면 Model Parallelism(텐서/파이프라인 분할)이 필요하고, 분할하면 GPU간 통신 오버헤드가 폭증합니다. Cerebras는 가중치를 영구 저장하지 않고 필요할 때만 스트리밍합니다. 모델 크기와 무관하게 동일한 프로그래밍 모델이 유지되고, 순수 데이터 병렬화만으로 스케일링됩니다.

---

## 5. MemoryX + SwarmX — 클러스터 수준 아키텍처

### MemoryX: 지능형 가중치 저장소

단순한 스토리지가 아닙니다. 가중치 저장 + 의존성 분석 + 파이프라인 스케줄링 + Weight update(optimizer step)를 자체 수행합니다. 구성 가능 용량은 4 TB ~ 2.4 PB이며, 200B ~ 120T 파라미터를 지원합니다.

### SwarmX: 브로드캐스트 + 리듀스 패브릭

```
                  MemoryX
                     │
            ┌────────┼────────┐
            ▼        ▼        ▼
        ┌──────┐ ┌──────┐ ┌──────┐
        │CS-3  │ │CS-3  │ │CS-3  │   ... 최대 192대
        │#1    │ │#2    │ │#3    │
        └──┬───┘ └──┬───┘ └──┬───┘
           │        │        │
            ▼        ▼        ▼
            └────────┼────────┘
                     │  Gradient Reduce
                     ▼
                  MemoryX
```

SwarmX의 두 가지 역할:

| 역할 | 방향 | 설명 |
|---|---|---|
| Weight Broadcast | MemoryX → CS-3 | 모든 CS-3에 동일 가중치 브로드캐스트 |
| Gradient Reduce | CS-3 → MemoryX | 모든 CS-3의 gradient를 합산하여 반환 |

결과: 10대의 CS-3 = 단일 CS-3 대비 10배 성능 (Near-linear scaling). 최대 구성은 192 × CS-3 = **1억 7,280만 AI 코어** 단일 클러스터입니다.

---

## 6. Prefill-Decode 분리와 Speculative Decoding

### 6.1 이기종 추론 — AWS Trainium3 + WSE-3 (2026.03)

2026년 3월 발표된 AWS-Cerebras 협업이 이 아키텍처의 진화를 보여줍니다:

```
┌─────────────────────────────────────────────────────┐
│              Disaggregated Inference                  │
│                                                      │
│  Stage 1: Prefill              Stage 2: Decode       │
│  ┌─────────────────┐          ┌──────────────────┐  │
│  │ AWS Trainium3    │   ──→   │ Cerebras WSE-3   │  │
│  │                  │  KV$    │                   │  │
│  │ 병렬 연산 최적화  │  전달   │ 대역폭 최적화     │  │
│  │ Compute-bound    │   →     │ Memory-bound      │  │
│  └─────────────────┘          └──────────────────┘  │
│                                                      │
│  각 단계를 최적 하드웨어에 할당하는 이기종 추론         │
└─────────────────────────────────────────────────────┘
```

> Prefill(연산 집약적)은 Trainium3의 대규모 병렬 연산력을 활용하고, Decode(대역폭 집약적)는 WSE-3의 21 PB/s SRAM 대역폭을 활용합니다. 기존 대비 5배 빠른 추론, 2,500+ tok/s가 목표입니다.

### 6.2 Speculative Decoding — 소프트웨어 레벨 최적화

하드웨어 위에 Speculative Decoding을 얹어 추가 속도를 확보합니다:

```
기존 Autoregressive:
[토큰1] → [토큰2] → [토큰3] → [토큰4] → [토큰5]
  1 pass    1 pass    1 pass    1 pass    1 pass  = 5 forward passes

Speculative Decoding:
Draft Model (소형):  [토큰1, 토큰2, 토큰3, 토큰4, 토큰5] 초안 생성
                              │
Target Model (대형):  검증 → [토큰1 ✓, 토큰2 ✓, 토큰3 ✓, 토큰4 ✗]
                              │
                     토큰4부터 재생성  = 2 forward passes (vs 5)
```

Cerebras는 이 기법으로 Llama 3.1 70B에서 2,100 tok/s를 달성한 바 있습니다. Spark에서도 유사한 기법이 적용되어 있을 가능성이 높습니다.

---

## 7. Distillation 파이프라인 — Teacher에서 Student로

### 7.1 압축의 필요성

GPT-5.3-Codex(풀 모델)은 파라미터 수가 미공개이나, GPT-5 계열의 규모를 감안하면 수백 B~1T+ 수준으로 추정됩니다. Spark가 1,000+ tok/s를 달성하려면 가중치가 온칩 SRAM에 상주해야 합니다. MemoryX Weight Streaming을 쓰면 속도가 떨어집니다.

WSE-3의 SRAM 용량별 수용 가능 모델 크기:

| 정밀도 | 파라미터당 바이트 | 44GB SRAM 수용량 |
|---|---|---|
| FP32 | 4 bytes | ~11B |
| FP16 / BF16 | 2 bytes | ~22B |
| FP8 | 1 byte | ~44B |
| INT4 | 0.5 byte | ~88B |

OpenAI의 "JPEG compression for neural weights" 비유가 정확합니다 — 큰 그림은 유지하되, 세밀한 디테일을 날립니다.

### 7.2 Knowledge Distillation — 기본 원리

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  Teacher: GPT-5.3-Codex (풀사이즈, GPU 클러스터)           │
│  │                                                       │
│  │  Input: "def fibonacci(n):"                           │
│  │                                                       │
│  │  Output: Soft Probability Distribution                │
│  │  ┌──────────────────────────────────────┐             │
│  │  │ "return" : 0.42                      │             │
│  │  │ "if"     : 0.31  ← dark knowledge    │             │
│  │  │ "n"      : 0.08                      │             │
│  │  │ "#"      : 0.05                      │             │
│  │  └──────────────────────────────────────┘             │
│  │         │                                             │
│  │         │ Soft Labels (with temperature τ)             │
│  │         ▼                                             │
│  │  Student: Codex-Spark (소형, WSE-3 타겟)               │
│  │  ┌──────────────────────────────────────┐             │
│  │  │ "return" : 0.38  ← Teacher에 가까워지도록│           │
│  │  │ "if"     : 0.35     학습              │             │
│  │  └──────────────────────────────────────┘             │
│  │                                                       │
│  │  Loss = α × KL(Teacher_soft ∥ Student_soft)            │
│  │       + (1-α) × CrossEntropy(Hard_label, Student)     │
│  │                                                       │
└─────────────────────────────────────────────────────────┘
```

Hard label("return"이 정답)만으로 학습하면 정보 손실이 큽니다. Teacher의 soft probability distribution에는 "if도 31% 가능성이 있다"는 **dark knowledge**가 담겨 있습니다.

### 7.3 Temperature Scaling

Temperature τ가 높을수록 분포가 부드러워집니다:

```
softmax(z_i / τ)

τ = 1 (일반): [0.85, 0.10, 0.03, 0.02]  → 정답에 집중
τ = 4 (높음): [0.42, 0.31, 0.15, 0.12]  → dark knowledge 노출
```

τ를 높이면 Teacher가 "2순위, 3순위 후보도 이 정도로 그럴듯하다"는 정보를 Student에게 전달할 수 있습니다.

### 7.4 세 가지 Distillation 전략

**1) Logit Matching (Response-Based)**

```
Loss = KL( softmax(z_teacher / τ) ∥ softmax(z_student / τ) )
```

Teacher의 최종 출력 분포를 Student가 모방합니다. 가장 단순하고 널리 사용되지만, 중간 표현의 풍부한 정보를 활용하지 못합니다.

**2) Feature/Hidden Layer Matching (Feature-Based)**

```
Loss = Σ_l  ‖ f(H_teacher^l) - g(H_student^l) ‖²
```

Teacher의 중간 hidden states를 Student가 모방합니다. f, g는 차원 변환 프로젝션입니다(Teacher와 Student의 hidden dim이 다르므로). Logit matching보다 풍부한 표현을 전달합니다.

**3) Layer-wise Progressive Distillation**

```
Phase 1: Layer 0-11 (Teacher)  → Layer 0-5 (Student)   정렬
Phase 2: Layer 12-23 (Teacher) → Layer 6-11 (Student)  정렬
Phase 3: Full model end-to-end fine-tuning
```

레이어를 블록 단위로 점진적으로 전달합니다. Temperature annealing과 결합하면 QA 벤치마크 +2.6%, 학습시간 -13% (2025 연구)입니다.

### 7.5 Spark 추정 파이프라인

OpenAI가 정확한 방법론을 공개하지 않았지만, 2025-2026 최신 기법을 종합하면:

```
Step 1: Architecture Design
  GPT-5.3-Codex 구조 분석 → Spark 타겟 아키텍처 결정
  (레이어 수 축소, hidden dim 축소, attention head 수 조정)
  44GB SRAM 제약 내 FP8 파라미터 수용 가능한 크기로 설계
         │
         ▼
Step 2: Progressive Distillation
  Teacher (Codex 풀사이즈)
      ├── Logit matching (τ=4~8)
      ├── Feature matching (핵심 레이어)
      └── Code-specific dataset (코딩 태스크 집중)
         │
         ▼
Step 3: Task-Specific Fine-tuning
  코드 생성, 코드 완성, 디버깅 태스크에 특화 학습
         │
         ▼
Step 4: Quantization (→ 섹션 8)
Step 5: Pruning (→ 섹션 9)
Step 6: Hardware Mapping (→ 섹션 10)
```

---

## 8. Quantization — 정밀도 깎기

### 8.1 정밀도 스펙트럼

| 형식 | 비트 구성 | 크기 | 용도 |
|---|---|---|---|
| FP32 | 1 sign + 8 exp + 23 mantissa | 32 bits | 학습 기본 |
| FP16 | 1 sign + 5 exp + 10 mantissa | 16 bits | 추론 기본 |
| BF16 | 1 sign + 8 exp + 7 mantissa | 16 bits | 넓은 범위, 낮은 정밀도 |
| FP8 | 1 sign + 4 exp + 3 mantissa | 8 bits | Spark 추정 주력 |
| INT4 | 4-bit integer | 4 bits | 일부 weight matrix |

### 8.2 Post-Training Quantization (PTQ)

```
원본 가중치 W (FP16):
[0.0234, -0.1567, 0.0891, -0.2341, 0.1123, ...]

                │
  Calibration (보정 데이터셋으로 분포 분석)
                │
                ▼
양자화된 가중치 W_q (FP8):
[0.023, -0.156, 0.089, -0.234, 0.112, ...]
         ↑ 정밀도 손실 발생하지만, 전체 분포는 유지
```

### 8.3 Mixed-Precision Quantization

모든 레이어를 동일 정밀도로 양자화하면 성능 저하가 큽니다. DeepSeek-V3가 선도한 Fine-grained Mixed-Precision 접근이 유력합니다:

| Layer 종류 | 양자화 전략 | 이유 |
|---|---|---|
| Embedding Layer | FP16 유지 | 첫 레이어, 민감 |
| Attention QKV | FP8 | 활성화 양자화 유리 |
| Attention Output | FP8 | 중간 정밀도 충분 |
| FFN Up/Gate | INT4 | 가장 큰 가중치 블록, 최대 절약 |
| FFN Down | FP8 | 출력 품질 유지 |
| Layer Norm | FP16 유지 | 파라미터 소량 |
| Output Head | FP16 유지 | 마지막 레이어, 민감 |

> FFN 레이어가 전체 파라미터의 ~2/3를 차지합니다. 이 부분을 INT4로 깎으면 메모리 절약 효과가 극대화됩니다. 활성화 양자화에서는 FP8이 INT8보다 일관되게 우수한데, 더 넓은 Dynamic Range 때문입니다.

---

## 9. Pruning — 구조적 가지치기

### 9.1 Structured vs Unstructured

```
Unstructured Pruning:              Structured Pruning:

┌───────────────────┐              ┌───────────────────┐
│ 0.23  0     0.45  │              │ 0.23  0.45  0.67  │
│ 0    -0.12  0     │ ← 개별 0삽입 │                   │ ← 행/열 통째 제거
│ 0.67  0     0.89  │              │ 0.67  0.89  0.34  │
│ 0     0.34  0     │              └───────────────────┘
└───────────────────┘               행렬 자체가 작아짐!
 sparse matrix (특수 HW 필요)        dense matrix (범용 HW 호환)
```

Spark에는 Structured Pruning이 유력합니다. WSE-3는 sparse matrix 가속 하드웨어가 아니라 Dense 연산에 최적화된 아키텍처이므로, 물리적으로 작은 모델이 필요합니다.

### 9.2 무엇을 잘라내는가

**1) Attention Head Pruning**

```
원본: 64 attention heads
       ┌─H1─H2─H3─...─H62─H63─H64─┐
       │  중요도 점수 계산 (gradient magnitude 등)  │
       └──────────────────────────────┘
                    │
                    ▼
Pruned: 48 attention heads (25% 제거)
       ┌─H1─H2─H4─...─H61─H63─────┐
       │  코딩에 불필요한 head 제거      │
       └──────────────────────────────┘
```

MHA에서 모든 head가 동등하게 중요하지 않습니다. 코딩 태스크에서 자연어 이해보다 구조적 패턴 인식이 중요한 head를 보존하고 나머지를 제거합니다.

**2) FFN Neuron Pruning**

```
FFN Layer (원본):  Input → Linear_up(d → 4d) → Activation → Linear_down(4d → d)
FFN Layer (pruned): Input → Linear_up(d → 2.5d) → Activation → Linear_down(2.5d → d)
                                    ↑ 37.5% 뉴런 제거
```

**3) Layer Removal**

```
원본:   96 Transformer layers
Pruned: 64 Transformer layers (하위 32개 제거)
```

깊은 레이어일수록 미세한 추론을 담당합니다. 코딩의 "빠른 완성" 용도에서는 앞쪽 레이어의 패턴 매칭 능력이 더 중요합니다. 이것이 **SWE-Bench Pro에서 72% → 56%로 떨어지는 이유**입니다. 16%p 차이는 주로 멀티스텝 추론(깊은 레이어가 담당)의 손실입니다.

---

## 10. Hardware Mapping — WSE-3에 최종 배치

### 10.1 최종 모델 스펙 (추정)

Distill + Quantize + Prune 이후의 모델을 WSE-3에 매핑합니다:

| 항목 | 추정치 |
|---|---|
| 파라미터 | ~30-40B (FP8 기준 30-40 GB) |
| 정밀도 | 혼합 (FP8 주력, 일부 INT4, 임베딩/출력 FP16) |
| 레이어 | 원본 대비 ~60-70% |
| Attention heads | 원본 대비 ~75% |
| FFN 폭 | 원본 대비 ~60-65% |
| 컨텍스트 | 128K (KV Cache SRAM 할당 필요) |

### 10.2 SRAM 44GB 할당 맵

```
┌──────────────────────────────────────┐
│  Model Weights:     ~30-35 GB        │
│  KV Cache:          ~6-8 GB          │
│  Activations:       ~2-4 GB          │
│  Workspace/Buffer:  ~1-2 GB          │
│  ─────────────────────────────       │
│  Total:             ~44 GB ← SRAM 꽉 │
└──────────────────────────────────────┘
```

> 128K 컨텍스트에서 KV Cache가 상당한 SRAM을 차지합니다. 이것이 Codex의 400K가 아닌 **128K로 제한된 물리적 이유**입니다.

### 10.3 추론 실행 흐름 (1 토큰 생성)

```
┌──────────────────────────────────────────────────────────┐
│  Token Generation (1 token)                               │
│                                                           │
│  1. 이전 토큰 임베딩 → SRAM에서 직접 읽기 (1 cycle)         │
│                                                           │
│  2. Layer 0:                                              │
│     ├─ QKV projection: SRAM 가중치 × 활성화 (온칩)         │
│     ├─ Attention: Q·K^T / √d → softmax → ·V              │
│     │   KV Cache 업데이트 (SRAM 내)                        │
│     ├─ Output projection (온칩)                            │
│     ├─ FFN: up → activation → down (온칩)                  │
│     └─ LayerNorm + Residual (온칩)                         │
│         결과를 2D mesh 통해 인접 PE로 전달 (1 cycle)        │
│                                                           │
│  3. Layer 1 ~ Layer N: 동일 반복                           │
│     모든 데이터 이동이 칩 내부 (21 PB/s)                    │
│                                                           │
│  4. Output head → logit → sampling → 토큰 출력             │
│                                                           │
│  총 소요: ~1 ms (= 1,000 tok/s)                           │
└──────────────────────────────────────────────────────────┘
```

**전 과정에서 외부 메모리 접근 = 0.** 이것이 1,000 tok/s의 비밀입니다.

---

## 11. 마무리

### 핵심 정리

| 질문 | 답 |
|---|---|
| 왜 빠른가? | 가중치가 HBM이 아닌 SRAM에 상주, 외부 메모리 접근 = 0 |
| 왜 품질이 떨어지는가? | Distillation + Pruning 과정에서 deep reasoning 레이어 손실 |
| 왜 128K인가? | KV Cache가 SRAM을 점유, 44GB 안에서 가중치와 공존해야 함 |
| 왜 Dense인가? | MoE의 조건부 라우팅은 SRAM 상주 패턴과 비효율적 |
| 왜 Text-only인가? | 멀티모달 인코더까지 SRAM에 넣으면 코딩 모델 품질 저하 |
| 다음 단계는? | AWS Trainium3(Prefill) + WSE-3(Decode) 이기종 추론 (2026 H2) |

### 레이어별 속도 기여도

| 레이어 | 기여 | 개선폭 |
|---|---|---|
| L1: Silicon Physics | SRAM 1-cycle latency vs HBM ~100ns | 지연 ~100x 감소 |
| L2: Chip Architecture | 21 PB/s on-chip vs 3.35 TB/s HBM | 대역폭 ~6,000x 증가 |
| L3: Model Compression | Distillation + Pruning + Quantization | 모델 크기 ~10-20x 축소 |
| L4: Inference Stack | Serving 최적화 + Speculative Decoding | 오버헤드 ~2-3x 감소 |
| L5: HW-SW Co-design | 모델과 하드웨어가 서로를 위해 설계됨 | 시너지 곱셈 효과 |

### 체크리스트

- [ ] Roofline 분석에서 Decode가 Memory-bound임을 이해했는가
- [ ] WSE-3의 44GB SRAM이 왜 HBM 대비 근본적으로 유리한지 설명할 수 있는가
- [ ] Weight Streaming이 Model Parallelism을 불필요하게 만드는 이유를 이해했는가
- [ ] Distillation의 dark knowledge(soft label)가 hard label 대비 어떤 정보를 추가로 전달하는지 설명할 수 있는가
- [ ] Mixed-Precision Quantization에서 FFN을 INT4로 깎는 근거를 이해했는가
- [ ] Structured Pruning이 WSE-3에서 Unstructured보다 유리한 이유를 설명할 수 있는가
- [ ] 128K 컨텍스트 제한이 물리적 SRAM 제약에서 기인함을 이해했는가

---

> **References**
>
> - [Cerebras Architecture Deep Dive](https://www.cerebras.ai/blog/cerebras-architecture-deep-dive-first-look-inside-the-hw-sw-co-design-for-deep-learning)
> - [Weight Streaming: Training Massive Models on Cerebras](https://www.cerebras.ai/blog/scaling-up-and-out-training-massive-models-on-cerebras-systems-using-weight-streaming)
> - [Linear Scaling Made Possible with Weight Streaming](https://www.cerebras.ai/blog/linear-scaling-made-possible-with-weight-streaming)
> - [Cerebras Inference: AI at Instant Speed](https://www.cerebras.ai/blog/introducing-cerebras-inference-ai-at-instant-speed)
> - [AWS + Cerebras Collaboration (2026.03)](https://press.aboutamazon.com/aws/2026/3/aws-and-cerebras-collaboration-aims-to-set-a-new-standard-for-ai-inference-speed-and-performance-in-the-cloud)
> - [A Survey on Model Compression for LLMs (MIT TACL 2025)](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00704/125482/)
> - [NVIDIA: Introduction to Speculative Decoding](https://developer.nvidia.com/blog/an-introduction-to-speculative-decoding-for-reducing-latency-in-ai-inference/)
> - [Cerebras CS-3 vs NVIDIA DGX B200](https://www.cerebras.ai/blog/cerebras-cs-3-vs-nvidia-dgx-b200-blackwell)

---

*Source: `blog/posts/harness-frontier/51-codex-spark-weight-streaming-distillation.md` | Category: [[blog-harness-frontier]]*

## Related

- [[blog-harness-frontier]]
- [[blog-hub]]
- [[geode]]
