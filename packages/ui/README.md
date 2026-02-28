# @repo/ui

Shared React UI primitives for the ASAP frontend.

## Goals

- keep visual language consistent across apps
- centralize typed, reusable component APIs
- isolate UI library quirks inside one package
- make Tailwind usage predictable and easy to audit

## Current primitives

- `Panel`
- `PageHeader`
- `Button`
- `Field`
- `Input`
- `Checkbox`
- `Select`
- `Combobox`
- `MetricCard`
- `SectionHeader`
- `Badge`
- `BadgeList`
- `Code`
- `cn`

## Design rules

- Tailwind-only styling
- no runtime CSS-in-JS
- dark trading dashboard visual language by default
- composition over page-specific abstractions
- icons are passed as slots when possible

## Integration requirements

The consuming app must include the package source in Tailwind content scanning.

Example:

```js
content: [
  "./src/**/*.{js,ts,jsx,tsx}",
  "../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
];
```

## Select and combobox

`Select` and `Combobox` use Headless UI internally for accessibility, but that dependency is intentionally hidden behind the package API.

Use `Select` for finite option lists.
Use `Combobox` when the option list needs filtering/search.

## Example

```tsx
import { Button, Field, Input, PageHeader, Panel, Select } from "@repo/ui";

<PageHeader
  kicker="Trading Engine"
  title="Create Bot"
  description="Persist a bot definition and bind an execution account."
/>

<Panel className="p-6">
  <Field label="Symbol">
    <Input placeholder="BTCUSDTM" />
  </Field>

  <Field label="Exchange">
    <Select
      value="kucoin"
      onChange={(value) => console.log(value)}
      options={[{ value: "kucoin", label: "KuCoin Futures" }]}
    />
  </Field>

  <Button variant="primary">Save</Button>
</Panel>
```

## Non-goals

- chart primitives
- domain-specific trading widgets
- route-level page orchestration
- API formatting helpers
