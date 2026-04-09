---
title: "TurboQuant CS Fundamentals Appendix"
type: reference
category: blog-post
tags: [blog, research]
source: "blog/research/turboquant-cs-fundamentals-appendix.md"
created: 2026-04-08T00:00:00Z
---

# TurboQuant CS Fundamentals Appendix

> Companion to [turboquant-kv-cache-compression.md](./turboquant-kv-cache-compression.md)
> Date: 2026-03-29 | Purpose: CS fundamentals underlying Google TurboQuant (ICLR 2026)

---

## Table of Contents

1. [Vector Quantization Fundamentals](#1-vector-quantization-fundamentals)
2. [Johnson-Lindenstrauss Lemma](#2-johnson-lindenstrauss-lemma)
3. [Information-Theoretic Lower Bounds for Quantization](#3-information-theoretic-lower-bounds-for-quantization)
4. [Polar Coordinates in High Dimensions](#4-polar-coordinates-in-high-dimensions)
5. [KV Cache in Transformer Attention](#5-kv-cache-in-transformer-attention)
6. [Attention Score Computation and Quantization Error Propagation](#6-attention-score-computation-and-quantization-error-propagation)

---

## 1. Vector Quantization Fundamentals

### 1.1 Core Concept

Vector quantization (VQ) maps a continuous high-dimensional vector **x** in R^d to one of a finite set of codewords {**c**_1, ..., **c**_K} in a codebook C. The encoder assigns **x** to its nearest codeword and transmits only the index i (requiring log2(K) bits). The decoder reconstructs **x** as **c**_i.

The fundamental tension is the **rate-distortion tradeoff**: fewer bits (lower rate) means higher reconstruction error (higher distortion), and no quantizer can beat the information-theoretic lower bound set by Shannon's rate-distortion function.

### 1.2 Rate-Distortion Theory

Shannon's rate-distortion function R(D) defines the minimum number of bits per symbol needed to represent a source with expected distortion at most D:

```
R(D) = min_{p(x_hat|x): E[d(x,x_hat)] <= D}  I(X; X_hat)
```

where I(X; X_hat) is the mutual information and d(x, x_hat) is the distortion measure (typically MSE).

For a d-dimensional Gaussian source X ~ N(0, sigma^2 * I_d) under squared error distortion:

```
R(D) = (d/2) * log2(sigma^2 / D)    for 0 < D < sigma^2
```

Inverting: the minimum achievable distortion at rate R bits per vector is:

```
D(R) = sigma^2 * 2^(-2R/d)
```

At b bits per coordinate (total budget B = b*d), this gives:

```
D(b) = sigma^2 / 4^b
```

This 1/4^b scaling is the fundamental information-theoretic floor that TurboQuant's Theorem 3 formalizes as a lower bound.

### 1.3 Lloyd-Max Quantizer

The Lloyd-Max algorithm finds the optimal scalar quantizer for a given probability density f(x). Given K reconstruction levels, it iterates:

**Step 1 (Nearest-Neighbor / Partition):**
Given reconstruction levels {c_1, ..., c_K}, define decision boundaries:

```
t_i = (c_i + c_{i+1}) / 2     (midpoint condition)
```

**Step 2 (Centroid / Update):**
Given partition regions [t_{i-1}, t_i), update reconstruction levels:

```
c_i = E[X | t_{i-1} <= X < t_i] = integral(x * f(x) dx, t_{i-1}, t_i) / integral(f(x) dx, t_{i-1}, t_i)
```

**Convergence:** Alternate Steps 1-2 until MSE stabilizes. The algorithm converges to a local (not necessarily global) minimum of:

```
D = sum_{i=1}^{K} integral( (x - c_i)^2 * f(x) dx, t_{i-1}, t_i )
```

This is a 1D analog of k-means clustering, discovered independently by Lloyd (1957, Bell Labs) and Max (1960).

### 1.4 Codebook Design for Higher Dimensions

The **Linde-Buzo-Gray (LBG)** algorithm generalizes Lloyd-Max to vector quantization:
1. Initialize K codewords (e.g., by splitting)
2. Assign each training vector to its nearest codeword (Voronoi partition)
3. Update each codeword to the centroid of its assigned vectors
4. Repeat until convergence

The resulting Voronoi regions tile R^d, and the codebook is data-dependent -- requiring a training dataset and O(K*d*N) computation per iteration.

### 1.5 Connection to TurboQuant

TurboQuant's key insight is to avoid data-dependent codebook design entirely. After applying a random rotation to the input vector, each coordinate independently follows a known **Beta distribution**:

```
f_X(x) = Gamma(d/2) / (sqrt(pi) * Gamma((d-1)/2)) * (1 - x^2)^((d-3)/2)
```

which concentrates toward N(0, 1/d) as d grows. Because this distribution is known analytically and is independent of the input data, a single Lloyd-Max codebook can be precomputed offline for each bit-width and reused universally. This is what makes TurboQuant "data-oblivious."

The paper reports ~178 Lloyd-Max iterations to converge on these codebooks. At b bits per coordinate with 2^b levels, TurboQuant achieves:

```
D_mse <= (sqrt(3) * pi / 2) * (1 / 4^b)  ~=  2.7 / 4^b
```

### 1.6 Key References

- **Cover & Thomas**, *Elements of Information Theory*, Ch. 10 (Rate-Distortion Theory)
- **Gersho & Gray**, *Vector Quantization and Signal Compression* (1992) -- the standard VQ textbook
- **Lloyd**, "Least squares quantization in PCM" (1982, published; 1957, internal Bell Labs memo)
- **Max**, "Quantizing for minimum distortion" (1960)
- **Linde, Buzo, Gray**, "An algorithm for vector quantizer design" (1980)

---

## 2. Johnson-Lindenstrauss Lemma

### 2.1 Core Concept

The Johnson-Lindenstrauss (JL) Lemma states that any finite set of points in high-dimensional space can be embedded into a much lower-dimensional space while approximately preserving all pairwise distances. The target dimension depends only on the number of points and the desired approximation quality -- not on the original dimension.

### 2.2 Formal Statement

**Theorem (Johnson & Lindenstrauss, 1984):**
For any 0 < epsilon < 1 and any set S of n points in R^d, there exists a map f: R^d -> R^m with:

```
m = O(epsilon^(-2) * ln(n))
```

such that for all u, v in S:

```
(1 - epsilon) * ||u - v||^2  <=  ||f(u) - f(v)||^2  <=  (1 + epsilon) * ||u - v||^2
```

The remarkable fact: m is independent of d. A set of n = 10^6 points in R^(10^9) can be projected to R^m with m ~ O(ln(10^6) / epsilon^2) ~ O(14 / epsilon^2) dimensions while preserving pairwise distances within factor (1 +/- epsilon).

### 2.3 Proof Sketch (via Random Projection)

1. **Construction:** Let A be an m x d matrix with entries drawn i.i.d. from N(0, 1/m). Define f(x) = A*x.

2. **Single pair analysis:** For a fixed pair u, v, let w = u - v. Then f(w) = A*w, and each coordinate (A*w)_j = (1/sqrt(m)) * sum of d Gaussians weighted by w_i, so (A*w)_j ~ N(0, ||w||^2 / m).

3. **Concentration:** ||f(w)||^2 = sum_{j=1}^{m} (A*w)_j^2 is a sum of m independent chi-squared(1) variables, scaled by ||w||^2/m. By sub-exponential tail bounds (Chernoff/moment generating function):

```
P( | ||f(w)||^2 - ||w||^2 | > epsilon * ||w||^2 ) <= 2 * exp(-m * epsilon^2 / 4)
```

4. **Union bound:** Over all (n choose 2) pairs, the probability that any pair violates the bound is at most:

```
n^2 * exp(-m * epsilon^2 / 4)
```

Setting m >= (8 / epsilon^2) * ln(n) makes this probability < 1, proving existence.

### 2.4 Random Projection Constructions

**Gaussian:** A_{ij} ~ N(0, 1/m). Theoretically cleanest; computationally O(m*d) per vector.

**Rademacher (sparse sign):** A_{ij} = +/- 1/sqrt(m) with equal probability. Same guarantees, faster to generate and multiply (no floating-point Gaussian sampling).

**Very sparse (Achlioptas, 2003):** A_{ij} = {+sqrt(3/m) with prob 1/6, 0 with prob 2/3, -sqrt(3/m) with prob 1/6}. Only 1/3 of entries are nonzero, yielding ~3x speedup.

**Structured (SRHT -- Subsampled Randomized Hadamard Transform):** f(x) = sqrt(d/m) * P * H * D * x, where D is a random sign-flip diagonal, H is the Hadamard matrix, and P samples m coordinates. Multiplication is O(d * log(d)) via fast Walsh-Hadamard transform, vs. O(m*d) for unstructured. TurboQuant uses this family -- "Randomized Hadamard Transform (WHT)" -- for the initial random rotation.

**Fast JL (Ailon & Chazelle, 2009):** Formalized the SRHT approach with optimal O(d * log(m)) runtime.

### 2.5 Connection to TurboQuant

TurboQuant uses JL projections in two distinct roles:

**Role 1 -- Random preconditioning (Stage 1, PolarQuant):** A random rotation (implemented as Randomized Hadamard Transform) is applied to each KV vector. This does not reduce dimension -- it redistributes the vector's energy uniformly across all coordinates, inducing the concentrated Beta distribution that enables data-oblivious scalar quantization.

**Role 2 -- QJL residual correction (Stage 2):** After MSE-optimal quantization, the residual r = x - Q(x) is projected by a random Gaussian matrix S and then sign-quantized to 1 bit per dimension:

```
Q_qjl(r) = sign(S * r)        -- encode
Q_qjl^{-1}(z) = sqrt(pi/2) / d * S^T * z    -- decode
```

The JL property guarantees that the sign bits preserve enough geometric structure of the residual for unbiased inner product estimation.

### 2.6 Key References

- **Johnson & Lindenstrauss**, "Extensions of Lipschitz mappings into a Hilbert space" (1984) -- original lemma
- **Dasgupta & Gupta**, "An elementary proof of a theorem of Johnson and Lindenstrauss" (2003) -- simplified proof via Gaussian projections
- **Achlioptas**, "Database-friendly random projections" (2003) -- sparse constructions
- **Ailon & Chazelle**, "The fast Johnson-Lindenstrauss transform and approximate nearest neighbors" (2009) -- SRHT/Fast JL
- **Freksen**, "An Introduction to Johnson-Lindenstrauss Transforms" (arXiv:2103.00564, 2021) -- modern survey
- **Vempala**, *The Random Projection Method* (2004) -- monograph

---

## 3. Information-Theoretic Lower Bounds for Quantization

### 3.1 Core Concept

Information theory provides absolute floors on quantization performance. No matter how clever the algorithm, there is a minimum distortion achievable at a given bit budget. TurboQuant's theoretical contribution is proving it comes within a constant factor of these floors.

### 3.2 Shannon Rate-Distortion Function

For a source X with distribution p(x) and distortion measure d(x, x_hat):

```
R(D) = min_{p(x_hat|x): E[d(X, X_hat)] <= D}  I(X; X_hat)
```

For the Gaussian source X ~ N(0, sigma^2) under MSE distortion:

```
R(D) = (1/2) * log2(sigma^2 / D)
D(R) = sigma^2 * 2^(-2R)
```

For a d-dimensional isotropic Gaussian X ~ N(0, sigma^2 * I_d):

```
R(D) = (d/2) * log2(sigma^2 / D)
D(R) = sigma^2 * 2^(-2R/d)
```

At b bits per coordinate (R = b*d total bits):

```
D_optimal = sigma^2 / 4^b
```

### 3.3 Shannon Lower Bound (SLB) for General Sources

For a continuous source with differential entropy h(X):

```
R(D) >= h(X) - (d/2) * log2(2 * pi * e * D / d)
```

This bound is tight for Gaussian sources and provides a universal baseline. Yamada, Tazaki, and Gray extended it to vector sources.

### 3.4 Sphere Packing Bound and Zador's Asymptotic Formula

**Sphere packing bound:** A codebook of K = 2^B codewords in R^d can be viewed as K non-overlapping Voronoi cells. The average distortion is lower-bounded by the MSE of the best sphere packing:

```
D >= G_d * V^(2/d)
```

where V is the volume per cell and G_d is the normalized second moment of the optimal d-dimensional Voronoi cell (G_1 = 1/12 for the interval).

**Zador's formula (1966, 1982):** At high rate (many bits), the MSE of the best d-dimensional quantizer for source density f(x) is:

```
D ~ G_d * ( integral( f(x)^(d/(d+2)) dx ) )^((d+2)/d)  *  2^(-2R/d)
```

The key insight: the exponential decay rate 2^(-2R/d) matches the rate-distortion function, confirming that lattice/structured quantizers can achieve information-theoretic scaling asymptotically.

**Gersho's conjecture (1979):** The optimal high-rate quantizer tiles space with congruent polytopes. Proven for d=1 (intervals) and d=2 (regular hexagons); open for d >= 3.

### 3.5 TurboQuant's Lower Bound (Theorem 3)

TurboQuant proves the following via **Yao's minimax principle**:

**MSE lower bound:**
```
For any b-bit quantizer Q: R^d -> {0,1}^(b*d),
    D_mse(Q) >= 1 / 4^b
```

**Inner product lower bound:**
```
For any b-bit quantizer Q that estimates <y, x>,
    D_prod(Q) >= (1/d) * (1 / 4^b)
```

**Proof technique (sketch):**
- By Yao's minimax principle, the worst-case distortion of any deterministic quantizer is at least the average distortion of the best deterministic quantizer on a worst-case input distribution.
- Choose the input distribution as isotropic Gaussian on the unit sphere.
- Apply Shannon's rate-distortion lower bound for this Gaussian source.
- The resulting bound is 1/4^b, matching the classical Gaussian rate-distortion result.

**Optimality gap:** TurboQuant's upper bound is (sqrt(3)*pi/2) / 4^b ~= 2.72 / 4^b. The gap to the lower bound is a constant factor of ~2.7 independent of bit-width or dimension. This is remarkable for a data-oblivious online algorithm.

| b (bits) | TurboQuant D_mse | Lower Bound | Gap   |
|----------|------------------|-------------|-------|
| 1        | ~0.36            | 0.25        | 1.45x |
| 2        | ~0.117           | 0.0625      | 1.87x |
| 3        | ~0.03            | 0.0156      | 1.92x |
| 4        | ~0.009           | 0.0039      | 2.31x |

### 3.6 Key References

- **Shannon**, "Coding theorems for a discrete source with a fidelity criterion" (1959) -- rate-distortion theory foundation
- **Cover & Thomas**, *Elements of Information Theory*, Ch. 10
- **Zador**, "Asymptotic quantization error of continuous signals and the quantization dimension" (1982)
- **Gersho**, "Asymptotically optimal block quantization" (1979)
- **Gray & Neuhoff**, "Quantization" (1998, IEEE Trans. IT) -- comprehensive 100-page survey
- **Yao**, "Probabilistic computations: toward a unified measure of complexity" (1977) -- minimax principle

---

## 4. Polar Coordinates in High Dimensions

### 4.1 Core Concept

In low dimensions, polar/spherical coordinates are a convenient change of variables. In high dimensions, they reveal startling geometric phenomena: almost all the volume of a ball concentrates in a thin shell near the surface, and almost all the area of a sphere concentrates near any equator. These concentration phenomena are exactly what PolarQuant exploits.

### 4.2 Polar Coordinate Transformation

A vector **x** in R^d can be expressed as:

```
x_1     = r * cos(phi_1)
x_2     = r * sin(phi_1) * cos(phi_2)
x_3     = r * sin(phi_1) * sin(phi_2) * cos(phi_3)
...
x_{d-1} = r * sin(phi_1) * ... * sin(phi_{d-2}) * cos(phi_{d-1})
x_d     = r * sin(phi_1) * ... * sin(phi_{d-2}) * sin(phi_{d-1})
```

where r = ||x|| >= 0, phi_i in [0, pi] for i = 1,...,d-2, and phi_{d-1} in [0, 2*pi).

The volume element transforms as:

```
dx_1 ... dx_d = r^(d-1) * sin^(d-2)(phi_1) * sin^(d-3)(phi_2) * ... * sin(phi_{d-2}) * dr * dphi_1 * ... * dphi_{d-1}
```

### 4.3 Concentration of Measure on the Sphere

**Thin shell concentration:** For a d-dimensional unit ball, the fraction of volume within the shell [1 - epsilon, 1] is:

```
Vol(shell) / Vol(ball) = 1 - (1 - epsilon)^d  ->  1  as d -> infinity
```

For d = 128 (typical attention head dimension) and epsilon = 0.1: over 99.9999% of the volume lies in the outermost 10% shell. For practical purposes, high-dimensional data lives on a thin spherical shell.

**Equatorial concentration (Levy's lemma):** Let f be a 1-Lipschitz function on the unit sphere S^(d-1). If **x** is drawn uniformly from S^(d-1):

```
P( |f(x) - E[f]| > t ) <= 2 * exp(-(d-1) * t^2 / 2)
```

This means any "reasonable" measurement of a random point on a high-dimensional sphere is concentrated around its mean with sub-Gaussian tails. The effective standard deviation is O(1/sqrt(d)).

**Coordinate distribution:** A single coordinate x_i of a uniform random point on S^(d-1) in R^d follows:

```
x_i ~ Beta(1/2, (d-1)/2)   (after rescaling)
```

with mean 0, variance 1/d. As d -> infinity, this converges to N(0, 1/d) by the central limit theorem.

### 4.4 The Curse (and Blessing) of Dimensionality

**Curse (for nearest-neighbor search):**
- All pairwise distances concentrate around the same value: for random points in R^d, max_distance / min_distance -> 1 as d -> infinity.
- The volume of a fixed-radius epsilon-ball becomes negligible relative to the unit cube: Vol(ball) / Vol(cube) ~ (sqrt(pi*e/d))^d -> 0.
- Brute-force search becomes as efficient as index-based methods.

**Blessing (for quantization -- what TurboQuant exploits):**
- After random rotation, each coordinate independently follows a known distribution.
- Coordinates become nearly independent in high dimensions (joint distribution factors approximately).
- The distribution is highly concentrated, so a small codebook captures most of the probability mass efficiently.
- These three facts justify applying independent scalar quantizers per coordinate without significant loss -- the product quantizer is near-optimal.

### 4.5 Connection to TurboQuant (PolarQuant)

PolarQuant uses a recursive pairwise polar decomposition rather than the standard sequential spherical coordinates:

```
Level 1: For each pair (x_{2j-1}, x_{2j}):
    psi_j^(1) = arctan(x_{2j} / x_{2j-1})       range [0, 2*pi)
    r_j^(1)   = sqrt(x_{2j-1}^2 + x_{2j}^2)

Level l: For each pair (r_{2j-1}^(l-1), r_{2j}^(l-1)):
    psi_j^(l) = arctan(r_{2j}^(l-1) / r_{2j-1}^(l-1))   range [0, pi/2]
    r_j^(l)   = sqrt((r_{2j-1}^(l-1))^2 + (r_{2j}^(l-1))^2)
```

After log2(d) levels, we have 1 radius and (d-1) angles.

**Angular concentration property:** After random preconditioning, the level-l angles follow:

```
f_Psi^(l)(psi) = C * sin^(2^(l-1) - 1)(2 * psi)
```

The exponent k = 2^(l-1) - 1 grows exponentially with level. Since sin^k(theta) concentrates sharply around theta = pi/4 as k grows:

| Level | k = 2^(l-1) - 1 | Concentration |
|-------|------------------|---------------|
| 1     | 0                | Nearly uniform |
| 2     | 1                | Mild |
| 3     | 3                | Strong |
| 4     | 7                | Very strong |
| 5+    | 15+              | Extreme |

This concentration means a few quantization levels suffice for higher levels, and the codebook is input-independent (computed analytically from the known sin^k distribution).

### 4.6 Key References

- **Blum, Hopcroft, Kannan**, *Foundations of Data Science*, Ch. 2 ("High-Dimensional Space")
- **Vershynin**, *High-Dimensional Probability* (2018), Ch. 5 ("Concentration on the sphere")
- **Ledoux**, *The Concentration of Measure Phenomenon* (2001) -- monograph
- **Ball**, "An elementary introduction to modern convex geometry" (1997) -- accessible introduction
- **Milman & Schechtman**, *Asymptotic Theory of Finite-Dimensional Normed Spaces* (1986) -- Levy's lemma origins

---

## 5. KV Cache in Transformer Attention

### 5.1 Multi-Head Attention Mechanism

The transformer attention mechanism (Vaswani et al., 2017) computes:

```
Attention(Q, K, V) = softmax(Q * K^T / sqrt(d_k)) * V
```

where Q, K, V in R^(n x d_k) are the query, key, and value matrices.

In **multi-head attention** with H heads:

```
MultiHead(X) = Concat(head_1, ..., head_H) * W_O

where head_i = Attention(X * W_Q^i, X * W_K^i, X * W_V^i)
```

Each head projects the d_model-dimensional input to d_k = d_model / H dimensions.

### 5.2 Why KV Pairs Must Be Stored

During autoregressive generation, each new token t must attend to all previous tokens 1..t-1. Without caching:

```
Step t: Compute K_t = [X_1 * W_K; ...; X_t * W_K]   -- recompute ALL keys
        Compute V_t = [X_1 * W_V; ...; X_t * W_V]   -- recompute ALL values
        Compute attn = softmax(q_t * K_t^T / sqrt(d_k)) * V_t
```

This requires O(t * d) computation per step and O(n^2 * d) total for n tokens.

With KV cache:

```
Step t: Retrieve K_{1:t-1}, V_{1:t-1} from cache
        Compute k_t = X_t * W_K,  v_t = X_t * W_V    -- single token only
        Append to cache: K_{1:t} = [K_{1:t-1}; k_t]
        Compute attn = softmax(q_t * K_{1:t}^T / sqrt(d_k)) * V_{1:t}
```

Per-step computation drops from O(t * d) to O(d) for the projection, though the attention computation itself is still O(t * d_k).

### 5.3 Memory Complexity

The KV cache stores, for every token position and every layer:

```
KV Cache Size = n * d_k * L * H * 2 * precision_bytes
              = n * d_model * L * 2 * precision_bytes
```

where:
- n = sequence length (number of tokens)
- d_k = head dimension (typically 128)
- H = number of attention heads (e.g., 32)
- L = number of transformer layers (e.g., 32)
- 2 = one for keys, one for values
- precision_bytes = 2 for FP16, 4 for FP32

**Concrete example (Llama-3.1-8B, FP16):**

```
n = 128K, d_model = 4096, L = 32, precision = 2 bytes

KV cache = 128,000 * 4,096 * 32 * 2 * 2 bytes
         = 128,000 * 524,288 bytes
         ~ 67 GB per sequence
```

Even at a more modest n = 8K:

```
KV cache = 8,000 * 4,096 * 32 * 2 * 2 ~ 4 GB per sequence
```

This frequently exceeds the model weights themselves (~16 GB for an 8B model in FP16), making KV cache the dominant memory consumer for long-context inference.

### 5.4 The Compression Opportunity

| Component | Bits (standard) | Already compressed? | TurboQuant target |
|-----------|----------------|--------------------|--------------------|
| Model weights | 16 (FP16) | Yes, to 4-bit via PTQ (GPTQ, AWQ) | No |
| Activations | 16 (FP16) | Transient, not stored | No |
| KV cache | 16 (FP16) | Mostly uncompressed in production | **Yes -- to 3 bits** |

TurboQuant specifically targets the KV cache because:
1. It is the largest memory consumer during long-context inference
2. It scales linearly with sequence length (unlike fixed-size weights)
3. It is written once and read many times (amenable to compress-once strategy)
4. Keys and values have different quantization sensitivities (keys have higher norms, requiring more bits)

### 5.5 Connection to TurboQuant

TurboQuant compresses each KV vector independently using its data-oblivious pipeline:

```
For each layer l, head h, position t:
    k_{l,h,t} in R^{d_k}  -->  TurboQuant encode  -->  ~3 bits * d_k bits
    v_{l,h,t} in R^{d_k}  -->  TurboQuant encode  -->  ~3 bits * d_k bits
```

At d_k = 128 and 3.5 bits/channel:
- Uncompressed: 128 * 16 = 2,048 bits per vector
- TurboQuant: 128 * 3.5 = 448 bits per vector
- Compression ratio: ~4.6x (with overhead) to ~5.9x (without)

Empirical finding from community implementations: Key vectors have dramatically higher norms than Value vectors (ratios from 4x to 182x across models). This implies keys are more sensitive to quantization error and may need asymmetric bit allocation (e.g., 4-bit keys + 2-bit values).

### 5.6 Key References

- **Vaswani et al.**, "Attention Is All You Need" (2017) -- transformer architecture
- **Pope et al.**, "Efficiently scaling transformer inference" (2023) -- KV cache analysis at scale
- **Raschka**, "Understanding and Coding the KV Cache in LLMs from Scratch" (2024) -- pedagogical implementation guide
- **Kwon et al.**, "Efficient Memory Management for Large Language Model Serving with PagedAttention" (vLLM, 2023)

---

## 6. Attention Score Computation and Quantization Error Propagation

### 6.1 Dot Product Attention

The attention score between query q and key k is:

```
score(q, k) = <q, k> / sqrt(d_k)
```

The scaling factor 1/sqrt(d_k) prevents the dot product magnitude from growing with dimension. Without scaling, if q and k have independent entries with mean 0 and variance 1, then:

```
E[<q, k>] = 0,    Var(<q, k>) = d_k
```

Large variance pushes softmax into saturation regions where gradients vanish.

### 6.2 Softmax and Attention Weights

The attention weight vector is:

```
alpha_i = exp(score_i) / sum_j exp(score_j)     i = 1, ..., n
```

Properties:
- alpha_i >= 0 and sum(alpha_i) = 1
- Softmax amplifies differences: the largest score gets disproportionate weight
- Softmax is Lipschitz-continuous with constant 1 (in L1 norm), meaning bounded input perturbation produces bounded output perturbation

The final attention output for a single query is:

```
output = sum_i alpha_i * v_i
```

### 6.3 How Quantization Error Propagates

When key k is quantized to k_hat = Q^{-1}(Q(k)), the error propagates through three stages:

**Stage 1 -- Inner product error:**

```
<q, k_hat> = <q, k> + <q, k_hat - k> = <q, k> + <q, epsilon>
```

where epsilon = k_hat - k is the quantization error. The attention score perturbation is:

```
delta_score = <q, epsilon> / sqrt(d_k)
```

**Stage 2 -- Softmax perturbation:**

For small perturbations, the softmax Jacobian gives:

```
delta_alpha_i ~= alpha_i * (delta_score_i - sum_j alpha_j * delta_score_j)
```

Critical insight: if a single key is quantized, the error affects all attention weights (not just the one for that key), because softmax is a global normalization.

**Stage 3 -- Output perturbation:**

```
delta_output = sum_i delta_alpha_i * v_i + sum_i alpha_i * delta_v_i
```

The first term is the indirect error (wrong attention weights applied to correct values). The second term is the direct error (correct attention weights applied to wrong values). Both contribute.

### 6.4 Why Unbiasedness Matters

If the quantizer is biased -- E[<q, k_hat>] != <q, k> -- then the attention scores have a systematic shift. This can cause:
- Tokens that should be attended to get systematically lower scores
- Attention mass shifts incorrectly, compounding across layers
- Errors accumulate through the L layers of the transformer

TurboQuant's QJL stage specifically addresses this. The MSE-optimal scalar quantizer (Stage 1) introduces bias in inner product estimation. The QJL residual correction (Stage 2) eliminates this bias:

```
E[<q, Q_prod^{-1}(Q_prod(k))>] = <q, k>    (exactly unbiased)
```

with bounded variance:

```
Var(<q, Q_prod^{-1}(Q_prod(k))>) <= (sqrt(3) * pi^2 * ||q||^2 / d) * (1 / 4^b)
```

### 6.5 Practical Nuances

Community implementations discovered a subtle tradeoff:

- **MSE-only quantization** (Stage 1 alone): Biased inner products, but low variance. Empirically wins on **Top-1 token matching** (the token with highest attention gets the most weight).
- **MSE + QJL** (both stages): Unbiased inner products, but higher variance. The increased variance can disrupt softmax Top-K ranking.

This happens because softmax is sensitive to the relative ordering of scores, not just their absolute values. A low-variance biased estimator may preserve ordering better than a zero-bias high-variance estimator, especially when the gap between the top scores is small.

The TurboQuant paper's benchmarks (LongBench, needle-in-haystack) show that the combined method works well at 3.5 bits, where variance is sufficiently low. At lower bit-widths (2-2.5 bits), the MSE-only variant may be more practical for certain workloads.

### 6.6 Error Scaling Analysis

The per-token attention error depends on:

```
||delta_output||^2  <=  O(n * D_prod * ||V||_F^2 / n)
                     =  O(D_prod * ||V||_F^2)
```

where n is sequence length and D_prod is the inner product distortion. Since D_prod ~ 1/(d * 4^b):

| Bits (b) | Relative error scaling | d_k = 128 |
|----------|----------------------|------------|
| 2        | 1 / (128 * 16) = 4.9e-4 | Low |
| 3        | 1 / (128 * 64) = 1.2e-4 | Very low |
| 3.5      | 1 / (128 * 128) = 6.1e-5 | Negligible |
| 4        | 1 / (128 * 256) = 3.1e-5 | Negligible |

At 3.5 bits with d_k = 128, the per-token attention error is ~6e-5 relative to the value norms -- well below the noise floor of typical LLM computations, consistent with TurboQuant's "zero accuracy loss" claim.

### 6.7 Key References

- **Vaswani et al.**, "Attention Is All You Need" (2017) -- Sec. 3.2.1 on scaled dot-product attention
- **Dettmers et al.**, "GPT3.int8(): 8-bit Matrix Multiplication for Transformers at Scale" (2022) -- quantization error analysis
- **Liu et al.**, "KIVI: A Tuning-Free Asymmetric 2-bit Quantization for KV Cache" (2024) -- key/value asymmetry analysis
- **Zandieh et al.**, "QJL: 1-Bit Quantized JL Transform for KV Cache Quantization" (2025) -- unbiased inner product estimation
- **Zandieh et al.**, "TurboQuant: Online Vector Quantization with Near-optimal Distortion Rate" (2025/2026) -- Theorems 1-3

---

## Cross-Cutting Summary: How the Fundamentals Connect in TurboQuant

```
                    CS Fundamental                          TurboQuant Usage
               =============================          ============================

               Johnson-Lindenstrauss Lemma     --->   Random rotation (Stage 1)
               + Random Projections                    preserves geometry, induces
                                                       known coordinate distribution

               Concentration of Measure        --->   After rotation, coordinates
               on High-Dimensional Spheres             follow Beta -> N(0,1/d),
               + Polar Coordinates                     enabling PolarQuant's
                                                       analytical codebook

               Lloyd-Max Quantizer             --->   Optimal scalar quantizer
               + Rate-Distortion Theory                applied per coordinate on
                                                       the known Beta distribution

               Shannon Lower Bound             --->   Proves 1/4^b is
               + Yao's Minimax Principle               the information-theoretic
                                                       floor; TurboQuant achieves
                                                       ~2.7/4^b (constant gap)

               QJL (Quantized JL)              --->   1-bit sign quantization
               + Sign Random Projections               of residual for unbiased
                                                       inner product estimation

               Transformer Attention           --->   KV cache is the target;
               + Softmax Score Computation             inner product preservation
                                                       ensures attention fidelity
```

---

## References (consolidated)

### Textbooks
- Cover & Thomas, *Elements of Information Theory* (2006) -- rate-distortion, source coding
- Gersho & Gray, *Vector Quantization and Signal Compression* (1992) -- VQ bible
- Vershynin, *High-Dimensional Probability* (2018) -- concentration, random matrices
- Blum, Hopcroft, Kannan, *Foundations of Data Science* (2020) -- JL, high-dimensional geometry
- Vempala, *The Random Projection Method* (2004) -- JL applications

### Foundational Papers
- Shannon, "Coding theorems for a discrete source with a fidelity criterion" (1959)
- Johnson & Lindenstrauss, "Extensions of Lipschitz mappings into a Hilbert space" (1984)
- Lloyd, "Least squares quantization in PCM" (1982)
- Zador, "Asymptotic quantization error of continuous signals" (1982)
- Gersho, "Asymptotically optimal block quantization" (1979)
- Yao, "Probabilistic computations: toward a unified measure of complexity" (1977)

### TurboQuant Lineage
- Zandieh et al., [TurboQuant](https://arxiv.org/abs/2504.19874) (ICLR 2026)
- Zandieh et al., [PolarQuant](https://arxiv.org/abs/2502.02617) (AISTATS 2026)
- Zandieh & Daliri, [QJL](https://arxiv.org/abs/2406.03482) (AAAI 2025)
- Jacques et al., [Quantized JL Lemma](https://arxiv.org/abs/1309.1507) (2013)
- Li, [Sign-Full Random Projections](https://arxiv.org/abs/1805.00533) (2018)

### Transformer and KV Cache
- Vaswani et al., "Attention Is All You Need" (2017)
- Liu et al., [KIVI](https://arxiv.org/abs/2402.02750) (ICML 2024)
- Hooper et al., [KVQuant](https://arxiv.org/abs/2401.18079) (NeurIPS 2024)
- Kwon et al., "PagedAttention / vLLM" (2023)

### Surveys
- Gray & Neuhoff, "Quantization" (IEEE Trans. IT, 1998) -- 100-page VQ survey
- Freksen, "An Introduction to Johnson-Lindenstrauss Transforms" (arXiv:2103.00564, 2021)
- Ledoux, *The Concentration of Measure Phenomenon* (2001)

---

*Source: `blog/research/turboquant-cs-fundamentals-appendix.md` | Category: [[blog-research]]*

## Related

- [[blog-research]]
- [[blog-hub]]
- [[geode]]
