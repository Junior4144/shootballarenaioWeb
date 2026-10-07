/** Patch changed nodes without resetting focus, input drafts or table scroll positions. */
export function updateContent(host: Element, html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  function patch(parent: Node, next: Node) {
    const children = Array.from(next.childNodes);
    for (let i = 0; i < children.length; i++) {
      const incoming = children[i], existing = parent.childNodes[i];
      if (!existing) { parent.appendChild(incoming.cloneNode(true)); continue; }
      if (existing.nodeType !== incoming.nodeType || existing.nodeName !== incoming.nodeName ||
          (existing instanceof Element && incoming instanceof Element && existing.id !== incoming.id)) {
        parent.replaceChild(incoming.cloneNode(true), existing); continue;
      }
      if (existing instanceof Element && incoming instanceof Element) {
        // Overview telemetry owns its own request and render lifecycle.
        if (existing.id === 'overview-live') continue;
        for (const attr of Array.from(existing.attributes)) if (!incoming.hasAttribute(attr.name) && !(existing instanceof HTMLDetailsElement && attr.name==='open')) existing.removeAttribute(attr.name);
        for (const attr of Array.from(incoming.attributes)) {
          if (existing.getAttribute(attr.name) !== attr.value) existing.setAttribute(attr.name, attr.value);
        }
        patch(existing, incoming);
      } else if (existing.nodeValue !== incoming.nodeValue) existing.nodeValue = incoming.nodeValue;
    }
    while (parent.childNodes.length > children.length) parent.lastChild!.remove();
  }
  patch(host, template.content);
}
