import type { Root, Element, ElementContent } from "hast";
import { visit, SKIP } from "unist-util-visit";

/** Strip all <h1> from the body — the page title is already rendered as the hero. */
export function rehypeStripFirstH1() {
  return (tree: Root) => {
    const kill = (parent: { children: unknown[] }): void => {
      const arr = parent.children as Array<{
        type?: string;
        tagName?: string;
        children?: unknown[];
      }>;
      for (let i = arr.length - 1; i >= 0; i -= 1) {
        const n = arr[i];
        if (n.type === "element" && n.tagName === "h1") {
          arr.splice(i, 1);
        } else if (n.type === "element" && Array.isArray(n.children)) {
          kill(n as unknown as { children: unknown[] });
        }
      }
    };
    kill(tree as unknown as { children: unknown[] });
  };
}

/** Wrap every <table> in <div class="table-wrap"> so it can scroll on narrow viewports. */
export function rehypeWrapTables() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "table") return;
      if (!parent || index == null) return;
      const parentEl = parent as Element | Root;
      if (
        parentEl.type === "element" &&
        (parentEl as Element).tagName === "div" &&
        Array.isArray(((parentEl as Element).properties?.className as string[]) ?? []) &&
        (((parentEl as Element).properties?.className as string[]) ?? []).includes("table-wrap")
      ) {
        return;
      }
      const wrapper: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["table-wrap"] },
        children: [node as ElementContent],
      };
      (parentEl as { children: ElementContent[] }).children[index] =
        wrapper as ElementContent;
    });
  };
}

/** Mark external links with target + rel + a visual class. */
export function rehypeExternalLinks() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "a") return;
      const props = (node.properties ?? {}) as Record<string, unknown>;
      const href = typeof props.href === "string" ? props.href : "";
      if (!/^https?:\/\//i.test(href)) return;
      const classes = Array.isArray(props.className)
        ? ([...(props.className as string[])])
        : props.className
          ? [String(props.className)]
          : [];
      if (!classes.includes("external-link")) classes.push("external-link");
      node.properties = {
        ...props,
        className: classes,
        target: "_blank",
        rel: "noopener noreferrer",
      };
    });
  };
}

/** Add a class to `<li>` elements that contain a checkbox input (GFM task list items). */
export function rehypeTaskList() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "li") return;
      const hasCheckbox = (node.children ?? []).some(
        (c) =>
          c.type === "element" &&
          c.tagName === "input" &&
          (c.properties as Record<string, unknown> | undefined)?.type === "checkbox",
      );
      if (!hasCheckbox) return;
      const props = (node.properties ?? {}) as Record<string, unknown>;
      const classes = Array.isArray(props.className)
        ? [...(props.className as string[])]
        : props.className
          ? [String(props.className)]
          : [];
      if (!classes.includes("task-item")) classes.push("task-item");
      node.properties = { ...props, className: classes };
    });
  };
}
