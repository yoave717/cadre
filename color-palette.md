# CLI Agent Color Palette 🎨

A warm, pastel color palette designed for a friendly co-partner CLI agent experience.

## Core Brand Colors

### Primary Colors
- **Warm Peach** `#FFB5A7` - Main accent, represents warmth and approachability
- **Soft Coral** `#FFC9A8` - Secondary accent, friendly notifications
- **Pastel Rose** `#F8B4D9` - Tertiary accent, highlights and emphasis

### Supporting Colors
- **Mint Cream** `#D4F1E8` - Success states, positive feedback
- **Lavender Mist** `#E6D5F5` - Information, neutral states
- **Butter Yellow** `#FFF4C4` - Warnings, gentle alerts
- **Sky Blush** `#FFE4E1` - Errors (soft, non-alarming)

## Functional Colors

### Text & UI Elements
- **Charcoal Soft** `#6B6B6B` - Primary text (not too harsh)
- **Warm Gray** `#9B9B9B` - Secondary text, less emphasis
- **Pearl White** `#F8F8F8` - Backgrounds
- **Cream White** `#FFFEF5` - Alternative backgrounds (warm tint)

### Status Indicators
- **Success** `#B8E6D5` (mint) - Completed tasks, success messages
- **Info** `#D5C4F5` (lavender) - Information, tips, suggestions
- **Warning** `#FFE9B3` (butter) - Caution, requires attention
- **Error** `#FFCCCB` (soft pink) - Errors, but gentle and not alarming
- **Progress** `#FFD4B8` (peach) - Active tasks, in-progress states

## Usage Examples

### CLI Output Scenarios

```
✓ Task completed successfully          [Mint Cream text]
→ Processing your request...           [Warm Peach text]
ℹ Helpful tip: You can use...         [Lavender Mist text]
⚠ This action requires confirmation    [Butter Yellow text]
✗ Oops, something went wrong          [Sky Blush text]
```

### Command States
- **User Input**: Warm Peach `#FFB5A7`
- **Agent Response**: Soft Coral `#FFC9A8`
- **System Message**: Lavender Mist `#E6D5F5`
- **Code/Technical**: Mint Cream `#D4F1E8`

### Interactive Elements
- **Selected Item**: Pastel Rose `#F8B4D9`
- **Hover State**: Lighter Peach `#FFDCD3`
- **Active Cursor**: Warm Peach `#FFB5A7`
- **Dimmed/Inactive**: Warm Gray `#9B9B9B`

## ANSI Color Codes Reference

For terminal implementation:

```bash
# Using 256-color mode
WARM_PEACH="\033[38;5;217m"
SOFT_CORAL="\033[38;5;223m"
PASTEL_ROSE="\033[38;5;218m"
MINT_CREAM="\033[38;5;158m"
LAVENDER_MIST="\033[38;5;183m"
BUTTER_YELLOW="\033[38;5;229m"
SKY_BLUSH="\033[38;5;224m"
CHARCOAL_SOFT="\033[38;5;242m"
RESET="\033[0m"
```

### RGB Values for Custom Implementation

| Color | RGB | Hex |
|-------|-----|-----|
| Warm Peach | rgb(255, 181, 167) | #FFB5A7 |
| Soft Coral | rgb(255, 201, 168) | #FFC9A8 |
| Pastel Rose | rgb(248, 180, 217) | #F8B4D9 |
| Mint Cream | rgb(212, 241, 232) | #D4F1E8 |
| Lavender Mist | rgb(230, 213, 245) | #E6D5F5 |
| Butter Yellow | rgb(255, 244, 196) | #FFF4C4 |
| Sky Blush | rgb(255, 228, 225) | #FFE4E1 |
| Charcoal Soft | rgb(107, 107, 107) | #6B6B6B |
| Warm Gray | rgb(155, 155, 155) | #9B9B9B |

## Design Principles

1. **Warmth over Clinical** - Avoid pure whites, blacks, and harsh blues
2. **Gentle Errors** - Even error states feel supportive, not alarming
3. **Soft Contrast** - Readable but not harsh on the eyes
4. **Consistent Temperature** - All colors lean warm (peachy/rosy undertones)
5. **Accessibility** - Maintain sufficient contrast for readability

## Emotional Tone

This palette conveys:
- 🤝 **Partnership** - We're working together
- 🌸 **Approachability** - Friendly and non-intimidating
- ☕ **Comfort** - Like a cozy conversation
- 🌅 **Optimism** - Warm and encouraging
- 💭 **Thoughtfulness** - Gentle and considerate

## Sample Color Swatches

```
███████ Warm Peach    #FFB5A7  (Primary - Agent personality)
███████ Soft Coral    #FFC9A8  (Secondary - Responses)
███████ Pastel Rose   #F8B4D9  (Accent - Selection)
███████ Mint Cream    #D4F1E8  (Success - Completion)
███████ Lavender Mist #E6D5F5  (Info - Helpful tips)
███████ Butter Yellow #FFF4C4  (Warning - Gentle alerts)
███████ Sky Blush     #FFE4E1  (Error - Supportive)
```
