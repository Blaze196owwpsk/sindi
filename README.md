# Sindí – Brownout Power Planner

**Live app:** https://blaze196owwpsk.github.io/sindi/

Scheduled and rotational brownouts are common in Iloilo and the rest of the Visayas. Grid maintenance can cut power for 12 hours, and yellow or red grid alerts bring rotational outages. Students and people who work from home still have online classes, deadlines and meetings, but they usually find out too late that their laptop, phone or Wi-Fi won't last.

Sindí turns a brownout advisory into a charging plan:

- **Devices**: phone, laptop, tablet, Wi-Fi router, rechargeable fan or lamp, power banks and mini UPS. Typical battery sizes are filled in for you.
- **Brownouts**: the date and times from your power utility's advisory, plus what you need power for (for example, the laptop for a 3-hour online class, or the router for the whole brownout).
- **Plan**:
  - checks whether your batteries cover what you need
  - shows how power banks fill the gaps
  - says which device runs out first and by how much
  - lists what to charge and the latest time to start charging each one

## How the numbers work

- Battery energy (Wh) = mAh × voltage ÷ 1000
- Energy needed (Wh) = hours of use × power draw (W)
- Usable power bank energy = stored energy × usable % (about 65% for power banks and 80% for a mini UPS, because energy is lost in conversion)
- Charging time ≈ missing energy ÷ (charger watts × 0.55), and the plan finishes charging 15 minutes before the brownout by default

## Tech

Plain HTML, CSS and JavaScript, with no framework and no build step. Data is saved in the browser with `localStorage` and can be exported or imported as a JSON backup. Hosted on GitHub Pages.

Built with the help of Claude (Anthropic), an AI assistant, which was used for requirements analysis, UI design, code generation and testing.

Made by John Ivan Sydrie Elgario.
