/**
 * Prompts for scripts/site-images.ts. 5-part framework: image type, subject, environment, camera/light, constraints.
 * Style follows website/BRAND.md section 7: real-looking people at work in UAE offices, warm natural light, wood, glass
 * and plants, with forest and sage tones; product shots on sage. Devices stay unbranded (no logos, no text).
 */

const SCENE =
  "Setting: a modern Dubai office with warm oak wood slat walls, glass partitions and green plants; decor in deep forest green and soft sage tones. Shot on a 35mm lens at f/2.8, natural warm daylight from large windows, soft shadows, shallow depth of field, editorial corporate photography, realistic skin and hands. Constraints: photorealistic, devices are plain unbranded laptops and monitors with no logos, no readable text anywhere, no watermarks, no brand names, not staged stock-photo poses.";

const PRODUCT =
  "Studio product photograph on a seamless soft sage-green background (#E6F1E0), three-quarter view, soft diffused key light from the upper left, gentle contact shadow, crisp detail, generous empty space around the product. Constraints: photorealistic, completely unbranded, no logos, no text, no watermarks, no people.";

const people = (subject: string) => `A photorealistic editorial photograph. ${subject} ${SCENE}`;

export interface SiteImage {
  name: string;
  aspect: "16:9" | "4:3" | "4:5" | "1:1" | "3:2";
  prompt: string;
}

export const SITE_IMAGES: SiteImage[] = [
  {
    name: "hero",
    aspect: "16:9",
    prompt: people(
      "A diverse team of four UAE professionals (an Emirati man in a white kandura, a South Asian woman, an Arab woman in a hijab and a European man) around a light wooden meeting table, each working on a slim business laptop, one pointing at a screen while another smiles. The group sits on the right two thirds of the frame; the left third is calm, softly out of focus wall and plants, leaving room for a headline.",
    ),
  },
  {
    name: "who-we-are",
    aspect: "4:3",
    prompt: people("An IT consultant in a navy blazer shows two clients a lineup of three business laptops on a table, explaining the differences, the clients listening with interest."),
  },
  {
    name: "guide-architect",
    aspect: "4:3",
    prompt: people("An architect at a powerful tower workstation with two large colour-accurate monitors showing an abstract 3D building model, a sketchbook and pencils on the desk."),
  },
  {
    name: "delivery",
    aspect: "3:2",
    prompt: people("An IT technician unpacking and setting up a row of new business laptops on a long desk for a team, boxes neatly stacked, a colleague holding a checklist clipboard."),
  },

  // industries (slugs from the portal's starter catalog)
  { name: "industry-real-estate", aspect: "4:3", prompt: people("A real estate agent showing a property listing on a thin lightweight laptop to a young couple at a bright sales gallery desk, a city skyline model in the background.") },
  { name: "industry-architecture-design", aspect: "4:3", prompt: people("A designer working at a large colour-accurate monitor with a drawing tablet and stylus, material samples and swatches on the desk.") },
  { name: "industry-engineering-construction", aspect: "4:3", prompt: people("A site engineer in a hard hat and high-visibility vest reviewing drawings on a rugged laptop at a site office table, a construction site visible through the window.") },
  { name: "industry-legal", aspect: "4:3", prompt: people("A lawyer in a tailored suit reviewing documents on a slim business laptop in a quiet office with law books on wooden shelves.") },
  { name: "industry-healthcare", aspect: "4:3", prompt: people("A receptionist at a clean modern clinic front desk with an all-in-one desktop computer, a doctor in a white coat passing by with a tablet.") },
  { name: "industry-finance-accounting", aspect: "4:3", prompt: people("A finance analyst at a desk with two monitors showing abstract charts and spreadsheets, a calculator and a coffee cup nearby.") },
  { name: "industry-education", aspect: "4:3", prompt: people("A teacher helping two university students working on laptops in a bright modern classroom.") },
  { name: "industry-hospitality", aspect: "4:3", prompt: people("A hotel front-desk agent at a sleek reception counter with a compact desktop computer, welcoming a guest with a suitcase.") },
  { name: "industry-logistics-trading", aspect: "4:3", prompt: people("A logistics coordinator with a laptop at a glass-walled office overlooking a clean warehouse with shelves and pallets.") },
  { name: "industry-media-production", aspect: "4:3", prompt: people("A video editor at a powerful workstation with two monitors showing an abstract colourful video timeline, studio headphones on the desk, dim warm lighting.") },
  { name: "industry-retail", aspect: "4:3", prompt: people("A store manager at a modern boutique counter using a compact desktop point-of-sale computer, neatly arranged products on shelves behind.") },
  { name: "industry-corporate-offices", aspect: "4:3", prompt: people("An open-plan corporate office with rows of identical business laptops on desks, employees working calmly, one person walking with a laptop.") },

  // product categories (slugs from the starter catalog)
  { name: "category-laptops", aspect: "1:1", prompt: `A slim modern business laptop, lid open at 110 degrees, dark grey aluminium. ${PRODUCT}` },
  { name: "category-desktops", aspect: "1:1", prompt: `A compact small-form-factor business desktop computer beside a slim 24-inch monitor, keyboard and mouse. ${PRODUCT}` },
  { name: "category-workstations", aspect: "1:1", prompt: `A professional tower workstation in dark grey with a mesh front panel. ${PRODUCT}` },
  { name: "category-servers", aspect: "1:1", prompt: `A 2U rack-mount server with a black front bezel and drive bays, three-quarter view. ${PRODUCT}` },
];
