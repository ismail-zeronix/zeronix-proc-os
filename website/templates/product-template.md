---
# Upload in the portal: Website › Products › Upload .md. It becomes a Draft (the same part number updates the product).
# Spec keys follow the category's template (Website › Categories), e.g. processor, memory, storage, graphics, display,
# weight, battery, ports, wireless, os, security, warranty. Unknown keys still show, under "More".
type: product
name: "HP EliteBook 840 G11"
brand: HP                       # must exist under Website › Brands
category: laptops               # a category slug
mpn: "A1B2C3EA#ABV"             # the UAE / Middle East part number (#ABV = Arabic/English keyboard)
series: "EliteBook 800"
source_url: "https://www.hp.com/ae-en/..."   # the brand page the specs come from
highlights:
  - 1.36 kg aluminium chassis
  - All-day battery with fast charge
specs:
  processor: "Intel Core Ultra 7 155U"
  memory: "16 GB DDR5"
  storage: "512 GB NVMe SSD"
  display: "14-inch WUXGA IPS, 400 nits"
  weight: "1.36 kg"
  battery: "56 Wh"
  os: "Windows 11 Pro"
  warranty: "3 years"
uae: { keyboard: "Arabic/English", warranty: "3 years HP Middle East" }
best_for:                       # puts the product on industry pages
  - { industry: real-estate, role: "Agents on the move", label: "Best overall" }
pros: [Light and well built, Excellent keyboard]
cons: [Base model has 16 GB only]
faq:
  - q: "Does it come with an Arabic keyboard?"
    a: "Yes, the #ABV part number has an Arabic/English keyboard."
---
A short description in Markdown: who it is for and why.
