import { h } from "../dom.ts";

let tip: HTMLElement | undefined;

// One tooltip for the page, following the pointer. Hover targets call show() and hide().
export const showTip = (event: MouseEvent, lines: readonly string[]) => {
  tip ??= document.body.appendChild(h("div", { class: "tip", role: "tooltip" }));
  tip.replaceChildren(...lines.map((line, index) => h("div", { class: index === 0 ? "tip-head" : "" }, line)));
  tip.style.display = "block";
  const { innerWidth } = window;
  const left = Math.min(event.clientX + 14, innerWidth - tip.offsetWidth - 8);
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${event.clientY + 14}px`;
};

export const hideTip = () => {
  if (tip) tip.style.display = "none";
};

// Hover and keyboard focus both show the lines.
export const withTip = (node: Element, lines: () => readonly string[]) => {
  node.addEventListener("mousemove", (event) => showTip(event as MouseEvent, lines()));
  node.addEventListener("mouseleave", hideTip);
  return node;
};
