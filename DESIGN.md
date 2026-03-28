# Design System - Inference Digital Twin

## Product Context
- **What this is:** A decision-support web app that predicts performance, cost, and power tradeoffs for inference infrastructure scenarios before teams spend engineering time or cloud budget.
- **Who it's for:** ML infrastructure engineers, platform/SRE teams, and FinOps stakeholders evaluating deployment choices.
- **Space/industry:** AI infrastructure, observability-adjacent analytics, and data-center capacity planning.
- **Project type:** Dashboard-style web application.

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian
- **Decoration level:** Intentional
- **Mood:** Calm control-room energy. Precise, trustworthy, and operationally focused, not flashy. The UI should feel like an instrument panel for expensive decisions.
- **Reference sites:**
  - https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/
  - https://docs.datadoghq.com/dashboards/widgets/
  - https://docs.newrelic.com/docs/query-your-data/explore-query-data/dashboards/introduction-dashboards/
  - https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Dashboards.html

## Typography
- **Display/Hero:** Fraunces - Gives the product a distinctive identity in headings while still feeling serious and high-trust.
- **Body:** Plus Jakarta Sans - Clear at small sizes, modern, and excellent for dense dashboard UI copy.
- **UI/Labels:** Plus Jakarta Sans (same as body) - Keeps controls and content visually unified.
- **Data/Tables:** IBM Plex Mono - High legibility for IDs, hashes, and metric columns; supports tabular reading patterns.
- **Code:** JetBrains Mono
- **Loading:**
  - Google Fonts:
    - `https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700&family=IBM+Plex+Mono:wght@400;500&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap`
- **Scale:**
  - `xs`: 12px / 0.75rem
  - `sm`: 14px / 0.875rem
  - `base`: 16px / 1rem
  - `lg`: 20px / 1.25rem
  - `xl`: 24px / 1.5rem
  - `2xl`: 32px / 2rem
  - `3xl`: 40px / 2.5rem

## Color
- **Approach:** Balanced
- **Primary:** `#0F766E` - Core action and trust signal; used for primary CTAs, active states, and key highlights.
- **Secondary:** `#1D4ED8` - Data/navigation accent for links, informational emphasis, and secondary actions.
- **Neutrals:**
  - `#F6F7F6` (surface background)
  - `#ECEFED` (elevated background)
  - `#D5DBD8` (borders/dividers)
  - `#94A3B8` (muted text)
  - `#334155` (body text)
  - `#0F172A` (high-emphasis text)
- **Semantic:**
  - success `#15803D`
  - warning `#B45309`
  - error `#B91C1C`
  - info `#1D4ED8`
- **Dark mode:** Keep hue relationships but reduce saturation by ~15% and lift contrast on text/surface pairs. Dark surfaces should be layered (`base`, `raised`, `panel`) to preserve structure.

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable-dense (dashboard-friendly)
- **Scale:** 2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64)

## Layout
- **Approach:** Grid-disciplined
- **Grid:**
  - Mobile: 4 columns
  - Tablet: 8 columns
  - Desktop: 12 columns
- **Max content width:** 1440px
- **Border radius:**
  - `sm`: 6px
  - `md`: 10px
  - `lg`: 14px
  - `full`: 9999px

## Motion
- **Approach:** Minimal-functional
- **Easing:** enter(ease-out), exit(ease-in), move(ease-in-out)
- **Duration:** micro(50-100ms), short(150-250ms), medium(250-400ms), long(400-700ms)

## Safe vs Risk
- **Safe choices (category baseline):**
  - Metric cards + tabular detail blocks for fast scanning and trustworthy comparisons.
  - Restrained semantic color usage for status (success/warning/error) so signals remain obvious.
  - Monospace for hashes/IDs/metrics to reduce misread risk during incident-like review.
- **Risks (memorable differentiation):**
  - Serif display heading (Fraunces) in a technical product, to avoid the generic dashboard look.
  - Warm-neutral base palette instead of cold blue-gray defaults, to reduce visual fatigue in long review sessions.
  - Subtle blueprint-style background texture in shell regions to reinforce simulation/instrumentation identity.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-27 | Initial design system created | Created by /design-consultation from product context plus observability dashboard research and first-principles fit for inference planning workflows. |
