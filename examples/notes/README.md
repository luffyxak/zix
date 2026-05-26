# My weekend notes

A tiny example folder you can `zix pack` to see what the output looks like.

## Highlights

- Markdown rendering with **bold**, *italic*, and `inline code`
- Fenced code blocks (with a few languages)
- Folder tree on the left
- Search-as-you-type (press `/`)

> Tip: try `zix pack ./examples/notes` from the repo root.

```js
function greet(name) {
  return `hello, ${name}!`;
}
console.log(greet('Zix'));
```

```python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

| Feature | Status |
|---|---|
| Markdown | ✅ |
| Code highlight | ✅ (curated set) |
| Encrypted mode | ✅ |
| Multi-file output | ❌ (by design) |
