type Child = Node | string | number | false | null | undefined | readonly Child[];
type Attrs = Record<string, string | number | boolean | undefined | ((event: Event) => void)>;

const append = (parent: Node, child: Child) => {
  if (child === false || child === null || child === undefined) return;
  if (Array.isArray(child)) for (const one of child) append(parent, one);
  else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
};

const apply = (node: Element, attrs: Attrs) => {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (typeof value === "function") node.addEventListener(name.slice(2).toLowerCase(), value);
    else node.setAttribute(name, value === true ? "" : String(value));
  }
};

// An HTML element: `h("div", { class: "card" }, "text", child)`. Text goes in as text, never as markup.
export const h = (tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement => {
  const node = document.createElement(tag);
  apply(node, attrs);
  append(node, children);
  return node;
};

const SVG = "http://www.w3.org/2000/svg";

export const s = (tag: string, attrs: Attrs = {}, ...children: Child[]): SVGElement => {
  const node = document.createElementNS(SVG, tag);
  apply(node, attrs);
  append(node, children);
  return node;
};

export const clear = (node: Element) => {
  while (node.firstChild) node.removeChild(node.firstChild);
};

export type { Child };
