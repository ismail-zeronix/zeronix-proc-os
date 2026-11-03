import { describe, expect, it } from "vitest";
import { categoryFor, galleryLinks, parseJsonValues, readListing, readTitle } from "@/lib/website/listing-import";

const E14 = 'Lenovo ThinkPad E14 Gen 7 Laptop, 14" WUXGA IPS 60Hz Display, Intel Core Ultra 5 226V, 16GB RAM, 512GB SSD, Intel Arc Graphics 130V, English Keyboard, No OS, Black | 21U2009MIG';
const DOCK = "Lenovo ThinkPad Universal USB-C Docking Station, 65W Output Power, 2x 3840x2160 @60 Hz Refresh Rate, Gigabit Ethernet, 2xDisplay Ports, 1xHDMI, 4xUSB Ports, Black | 40AY0090UK / 40AY0090EU";
const X1 = 'ThinkPad X1 Carbon Gen 14 Aura Edition Laptop, 14" 2.8K OLED Display, Intel Core Ultra 7 365, 32GB RAM, 512GB SSD, Intel Graphics, English Backlit Keyboard, Windows 11 Pro, Black | 21V7006FUS';
const LOQ = 'Lenovo LOQ 15ARP10E Gaming Laptop, 15.6" FHD IPS 144Hz Display, AMD Ryzen 7 170, 16GB RAM, 512GB SSD, GeForce RTX 4050 6GB GPU, English Keyboard, Win 11, Black | 83S0007FUS';

const listing = [
  {
    category: { id: 615, title: "Laptops & Accessories" },
    products: [
      { id: 1, title: E14, categories: [{ name: "Laptops" }], cover_image_url: "https://cdn.example/x.jpg", prices: { current: 4149, old: 4149 } },
      { id: 2, title: DOCK, categories: [{ name: "Docking Stations" }], active_offer: { price: 655 }, prices: { current: 655 } },
      { id: 3, title: X1, categories: [{ name: "Laptops" }], prices: { current: 8689 } },
      { id: 4, title: "Some bundle without a part number", categories: [{ name: "Laptops" }], prices: { current: 99 } },
    ],
  },
];

describe("listing import", () => {
  it("reads a laptop title into our name, specs and keyboard", () => {
    const r = readTitle(E14);
    expect(r).toMatchObject({
      mpn: "21U2009MIG",
      brand: "Lenovo",
      name: "Lenovo ThinkPad E14 Gen 7, Core Ultra 5 226V, 16GB RAM, 512GB SSD",
      keyboard: "English Keyboard",
      specs: { display: '14" WUXGA IPS 60Hz', processor: "Intel Core Ultra 5 226V", memory: "16GB", storage: "512GB SSD", graphics: "Intel Arc Graphics 130V", os: "No OS", colour: "Black" },
    });
  });

  it("finds the brand from the series and the first of two part numbers", () => {
    expect(readTitle(X1)).toMatchObject({ mpn: "21V7006FUS", brand: "Lenovo", name: "Lenovo ThinkPad X1 Carbon Gen 14 Aura Edition, Core Ultra 7 365, 32GB RAM, 512GB SSD" });
    expect(readTitle(LOQ)).toMatchObject({ name: "Lenovo LOQ 15ARP10E, Ryzen 7 170, 16GB RAM, 512GB SSD", specs: { graphics: "GeForce RTX 4050 6GB GPU", os: "Win 11" } });
    const dock = readTitle(DOCK);
    expect(dock).toMatchObject({ mpn: "40AY0090UK", name: "Lenovo ThinkPad Universal USB-C Docking Station", specs: {} });
    expect("highlights" in dock && dock.highlights[0]).toBe("65W Output Power");
  });

  it("reads the listing: category, price, skips what it cannot use, ignores pictures", () => {
    const { items, skipped } = readListing(listing);
    expect(items.map((i) => [i.mpn, i.category, i.price])).toEqual([
      ["21U2009MIG", "laptops", "4149.00"],
      ["40AY0090UK", "accessories", "655.00"],
      ["21V7006FUS", "laptops", "8689.00"],
    ]);
    expect(skipped).toHaveLength(1);
    expect(JSON.stringify(items)).not.toContain("cdn.example");
  });

  it("takes several JSON blocks pasted one after another, and says when one is cut off", () => {
    const text = `${JSON.stringify(listing)}\n\n${JSON.stringify({ category: { title: "Monitors" }, products: [{ title: 'Dell P2425H 24" Monitor, FHD IPS, 100Hz | P2425H', prices: { current: 599 } }] })}`;
    const { items } = readListing(parseJsonValues(text));
    expect(items).toHaveLength(4);
    expect(items[3]).toMatchObject({ mpn: "P2425H", category: "monitors", brand: "Dell" });
    expect(() => parseJsonValues(JSON.stringify(listing).slice(0, -5))).toThrow(/cut off/);
  });

  it("keeps the product page link and reads the page's gallery in order", () => {
    const withUrl = [{ title: E14, url: "https://shop.example/product/e14/", prices: { current: 1 } }];
    expect(readListing(withUrl).items[0].pageUrl).toBe("https://shop.example/product/e14/");
    expect(readListing([{ title: E14, url: "javascript:alert(1)" }]).items[0].pageUrl).toBe("");
    const html = `
      <a class="elem image lightbox-opener" data-type="image" href="https://cdn.example/p/aaa-hi.jpg"><img data-src="https://cdn.example/p/aaa-md.jpg"></a>
      <a class="elem image lightbox-opener" data-type="image" href="https://cdn.example/p/bbb-hi.jpg"></a>
      <a class="elem image lightbox-opener" data-type="image" href="https://cdn.example/p/aaa-hi.jpg"></a>
      <div class="related"><img src="https://cdn.example/p/zzz-md.jpg"></div>`;
    expect(galleryLinks(html)).toEqual(["https://cdn.example/p/aaa-hi.jpg", "https://cdn.example/p/bbb-hi.jpg"]);
  });

  it("maps shop categories to ours", () => {
    expect(["Mobile Workstations", "All-in-One PCs", "Gaming Mice", "Microsoft Office", "Laptops"].map(categoryFor)).toEqual(["workstations", "desktops", "accessories", "software", "laptops"]);
  });
});
