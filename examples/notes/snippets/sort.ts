// In-place quicksort, no globals.
export function quicksort<T>(arr: T[], cmp: (a: T, b: T) => number = defaultCmp): T[] {
  qs(arr, 0, arr.length - 1, cmp);
  return arr;
}

function qs<T>(a: T[], lo: number, hi: number, cmp: (a: T, b: T) => number): void {
  if (lo >= hi) return;
  const pivot = a[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (cmp(a[j], pivot) < 0) {
      [a[i], a[j]] = [a[j], a[i]];
      i++;
    }
  }
  [a[i], a[hi]] = [a[hi], a[i]];
  qs(a, lo, i - 1, cmp);
  qs(a, i + 1, hi, cmp);
}

function defaultCmp<T>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
