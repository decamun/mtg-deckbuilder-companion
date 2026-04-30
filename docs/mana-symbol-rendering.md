## Mana symbol rendering

Use `ManaText` from `@/components/mana/ManaText` for user-visible card names,
mana costs, and rules text that may contain Magic brace syntax such as `{G}`,
`{1}`, `{T}`, `{G/U}`, or `{2/G}`.

`ManaText` parses brace-delimited tokens into accessible inline symbols and
leaves the rest of the string unchanged:

```tsx
<ManaText text="{1}{G}: Add one mana of any color." />
```

Prefer `ManaText` over rendering raw strings in React when the source is
Scryfall text or user-entered deck/card text that follows Magic notation. Keep
plain strings for exports, API responses, search keys, and logs.
