# Design System Specification: The Tactile Editorial

## 1. Overview & Creative North Star
**Creative North Star: The Curated Folio**
This design system rejects the sterile, "plastic" nature of modern SaaS interfaces in favor of a high-end editorial experience. It is inspired by the weight of premium 300gsm cardstock, the precision of a master printer, and the quiet confidence of a boutique gallery monograph. 

To break the "template" look, we employ **Intentional Asymmetry**. Hero sections should utilize the `16` (5.5rem) and `20` (7rem) spacing tokens to create white space that feels like a luxury margin, rather than a technical constraint. Overlap typography across surface boundaries to create a sense of physical layering, moving away from rigid, boxed-in layouts.

---

## 2. Colors & Surface Logic
The palette is rooted in organic, desaturated tones. We avoid high-energy vibrance to maintain a "printed" aesthetic.

*   **Background (#fbf9f5):** Our "Paper Base." All layouts start here.
*   **Primary (#366769):** A soft, oxidized Mint used for focused actions.
*   **Secondary (#5c5e6e):** A muted Lavender-Grey for supporting UI elements.
*   **Tertiary (#755a40):** A warm, dusty Peach for accents and humanistic touches.

### The "No-Line" Rule
Standard 1px solid borders are strictly prohibited for sectioning. Structural boundaries must be defined solely through background color shifts. To separate a sidebar from a main feed, transition from `surface` to `surface-container-low`.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked sheets. 
*   **Base:** `surface` (#fbf9f5)
*   **Deepest Inset:** `surface-container-high` (#e9e8e3) for recessed search bars or utility wells.
*   **Raised Element:** `surface-container-lowest` (#ffffff) for the "brightest" paper cards.

### The Glass & Gradient Rule
For high-end CTAs, do not use flat fills. Use a subtle linear gradient from `primary` to `primary-container` at a 15-degree angle. For floating navigation or "quick-action" menus, use a `surface-container-lowest` fill at 80% opacity with a `backdrop-blur` of 12px to create a frosted-glass vellum effect.

---

## 3. Typography
We pair the intellectual authority of a serif with the functional clarity of a geometric sans-serif.

*   **Display & Headlines (Newsreader):** Use these for storytelling. The `display-lg` (3.5rem) should be set with `letter-spacing: -0.02em` to mimic tight, professional typesetting.
*   **Body & UI (Work Sans):** Used for all functional data. `body-md` (0.875rem) is our workhorse.
*   **The Editorial Scale:** Use `headline-lg` for section headers, but set them in `on-surface-variant` (#5e605b) rather than pure black to soften the visual "hit" against the cream paper background.

---

## 4. Elevation & Depth
Elevation in this system is a tactile property, not a digital shadow.

*   **The Layering Principle:** Physicality is achieved by stacking. A card (`surface-container-lowest`) sitting on a section (`surface-container-low`) creates a natural 3D lift without any CSS shadows. 
*   **Ambient Shadows:** For floating modals, use a "Paper Shadow": 
    *   `box-shadow: 0 12px 32px -4px rgba(49, 51, 47, 0.06);` 
    *   Note the use of `on-surface` (#31332f) as the shadow tint rather than pure black.
*   **The Ghost Border Fallback:** If accessibility requires a border, use `outline-variant` (#b2b2ad) at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
*   **Primary:** `primary` background with `on-primary` text. `rounded-md` (0.375rem). Use a very subtle inner-glow (1px white top border at 20% opacity) to simulate a beveled paper edge.
*   **Secondary:** `secondary-container` background with `on-secondary-container` text. No border.
*   **Tertiary:** Text only using `title-sm` weight, with a `primary` underline that is 2px thick and offset by 4px.

### Cards & Lists
*   **Cards:** Forbid divider lines. Use `spacing-4` (1.4rem) padding and a background shift to `surface-container-low`.
*   **Lists:** Separate items using `spacing-2` (0.7rem) of vertical white space. If separation is visually unclear, use a 1px height `surface-variant` (#e3e3dc) rectangle that spans only 80% of the container width, centered.

### Input Fields
*   **Styling:** Inputs should be `surface-container-lowest` with a `rounded-sm` corner. 
*   **Focus State:** Do not use a heavy blue ring. Transition the background to `surface` and apply the "Ghost Border" at 40% opacity.

### Floating Folios (New Component)
A custom component for this system: A "floating sheet" used for secondary details. It uses `surface-container-lowest`, a `rounded-xl` corner, and the Ambient Shadow. It should always overlap two different background sections to emphasize the system's depth.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use asymmetrical margins. If the left margin is `spacing-8`, try a right margin of `spacing-12` for editorial flair.
*   **Do** use `newsreader` for numbers in data visualizations to give them a "financial report" prestige.
*   **Do** allow elements to "bleed" off the edge of containers in decorative contexts.

### Don't:
*   **Don't** use pure #000000 black. Use `on-surface` (#31332f) for all text to maintain the "ink-on-paper" softness.
*   **Don't** use `rounded-full` for buttons unless they are icon-only. The system relies on "slightly softened" corners (`0.25rem` to `0.5rem`), not circles.
*   **Don't** use standard "Drop Shadows." If an element isn't lifting via tonal layering, rethink the layout.