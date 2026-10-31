/**
 * Industries a prospect can be in, and a first guess from its name and website titles (no AI). Research with AI
 * confirms or corrects it from the website text; people can change it on the prospect. Pure rules, easy to test.
 */

export const INDUSTRIES = [
  { key: "Real estate", words: /\b(real ?esta(?:te|e)s?|propert(?:y|ies)|realty|realtors?|brokers?|homes|estates?|developments?|developers?)\b/i },
  { key: "Construction and contracting", words: /\b(contracting|contractors?|construction|building materials|fit ?out|interiors?|joinery|steel|scaffolding|aluminium|glass|electromechanical|mep)\b/i },
  { key: "Engineering and consultancy", words: /\b(engineering|engineers?|architects?|architecture|consult(?:ants?|ancy|ing)|surveyors?|design studio)\b/i },
  { key: "Healthcare", words: /\b(clinics?|hospitals?|medical|pharmac(?:y|ies)|dental|dentists?|health ?care|polyclinic|diagnostics?|labs?|laborator(?:y|ies)|physiotherapy)\b/i },
  { key: "Education", words: /\b(schools?|academy|academies|nursery|nurseries|institutes?|training|education(?:al)?|college|universit(?:y|ies)|learning)\b/i },
  { key: "Hospitality and food", words: /\b(hotels?|resorts?|restaurants?|cafe|cafeteria|catering|kitchen|foods?|bakery|sweets|coffee|hospitality|hotel apartments)\b/i },
  { key: "Retail", words: /\b(supermarket|hypermarket|stores?|shops?|boutique|fashion|jewell?er(?:y|s)?|perfumes?|cosmetics|furniture|electronics shop|mall)\b/i },
  { key: "Logistics and transport", words: /\b(logistics|shipping|freight|cargo|transport(?:ation)?|courier|warehous(?:e|ing)|movers|clearing|forwarding|marine)\b/i },
  { key: "Trading", words: /\b(trading|traders?|general trading|import|export|suppl(?:y|ies|iers?)|distribut(?:ion|ors?)|wholesale)\b/i },
  { key: "IT and technology", words: /\b(it solutions|information technology|technolog(?:y|ies)|software|computers?|systems|networks?|digital|telecom|cyber|tech)\b/i },
  { key: "Professional services", words: /\b(legal|advocates?|law firm|lawyers?|accounting|accountants?|auditors?|audit|chartered|tax|bookkeeping|management consultants?|corporate services|business setup|pro services|recruitment|hr)\b/i },
  { key: "Finance and insurance", words: /\b(insurance|bank|finance|financial|investments?|capital|exchange|brokerage|fund)\b/i },
  { key: "Manufacturing and industrial", words: /\b(manufactur(?:ing|ers?)|factory|industr(?:y|ies|ial)|plastics?|printing|packaging|chemicals?|fabrication)\b/i },
  { key: "Automotive", words: /\b(auto(?:motive)?|cars?|motors?|garage|vehicles?|spare parts|tyres?|rent a car)\b/i },
  { key: "Travel and tourism", words: /\b(travel|tours?|tourism|holidays|car rental|safari)\b/i },
  { key: "Media and marketing", words: /\b(media|marketing|advertising|events?|exhibitions?|printing press|production|creative|branding)\b/i },
  { key: "Beauty and wellness", words: /\b(salon|spa|beauty|barber|gym|fitness|wellness)\b/i },
  { key: "Facilities and security", words: /\b(facilit(?:y|ies) management|cleaning|security services|guarding|pest control|maintenance)\b/i },
] as const;

export type IndustryKey = (typeof INDUSTRIES)[number]["key"] | "Other";
export const INDUSTRY_KEYS: IndustryKey[] = [...INDUSTRIES.map((i) => i.key), "Other"];
export const isIndustry = (k: string): k is IndustryKey => (INDUSTRY_KEYS as string[]).includes(k);

/**
 * The industry the company's name (or website title) points to: the first rule that matches, in the order above, so
 * "XYZ Real Estate Brokers" is Real estate, not Finance. Empty when nothing matches (not "Other": unknown).
 */
export function guessIndustry(...texts: string[]): IndustryKey | "" {
  for (const text of texts) {
    const t = text.replace(/[_./-]+/g, " ");
    if (!t.trim()) continue;
    const hit = INDUSTRIES.find((i) => i.words.test(t));
    if (hit) return hit.key;
  }
  return "";
}
