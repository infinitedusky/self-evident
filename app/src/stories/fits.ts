// What the narrow stories measure: an address that keeps its text inside its own box, and things that sit on
// different rows. Used by the smoke test's and the prototype's stories.

/** Whether everything in an address bar stays inside its box: nothing sticks out over what is beside it. */
export function addressFits(form: Element) {
  const box = form.getBoundingClientRect()
  return [...form.children].every((el) => {
    const r = el.getBoundingClientRect()
    return r.width === 0 || (r.left >= box.left - 0.5 && r.right <= box.right + 0.5)
  })
}

/** Whether `below` starts under the bottom of `above`: a row of its own. */
export const onARowBelow = (below: Element, above: Element) => below.getBoundingClientRect().top >= above.getBoundingClientRect().bottom - 0.5

/** Whether the two overlap on the page at all. */
export function overlap(a: Element, b: Element) {
  const x = a.getBoundingClientRect(), y = b.getBoundingClientRect()
  return x.left < y.right - 0.5 && y.left < x.right - 0.5 && x.top < y.bottom - 0.5 && y.top < x.bottom - 0.5
}
