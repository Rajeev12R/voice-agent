import * as xlsxPkg from "xlsx";
import path from "path";

const XLSX = xlsxPkg.default || xlsxPkg;
const filePath = path.join(process.cwd(), "data", "products.xlsx");

let productsCache = null;

// Read Excel once and keep products in memory
export function loadProducts() {
  if (productsCache) return productsCache;

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets["Products"];

  if (!sheet) {
    throw new Error("Products sheet not found in Excel file.");
  }

  productsCache = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: true
  });

  console.log(`Loaded ${productsCache.length} products from Excel.`);

  return productsCache;
}

// Search products using customer requirements
export function searchProducts(entities = {}) {
  const products = loadProducts();

  const normalize = value =>
    String(value ?? "").trim().toLowerCase();

  const brand = normalize(entities.brand);
  const category = normalize(entities.category);
  const productName = normalize(entities.productName);
  const otherReq = normalize(entities.otherRequirements);
  const budget = Number(entities.budget);

  const hasBudget =
    entities.budget !== null &&
    entities.budget !== undefined &&
    entities.budget !== "" &&
    Number.isFinite(budget);

  const results = products.filter(product => {
    const pBrand = normalize(product.brand);
    const pCategory = normalize(product.category);
    const pName = normalize(product.productName);
    const pPrice = Number(product.price);

    // Brand matching
    if (brand && !pBrand.includes(brand)) {
      return false;
    }

    // Category matching
    if (
      category &&
      !pCategory.includes(category) &&
      !category.includes(pCategory)
    ) {
      return false;
    }

    // Product name matching
    if (productName && !pName.includes(productName)) {
      return false;
    }

    // Budget matching
    if (hasBudget) {
      if (!Number.isFinite(pPrice) || pPrice > budget) {
        return false;
      }
    }

    return true;
  });

  // Prioritize products matching any extra requirements in specs/features
  if (otherReq && results.length > 1) {
    const keywords = otherReq.split(/\s+/).filter(w => w.length > 2);
    if (keywords.length > 0) {
      results.sort((a, b) => {
        const textA = normalize(
          `${a.productName} ${a.processor} ${a.ram} ${a.storage} ${a.features} ${a.description}`
        );
        const textB = normalize(
          `${b.productName} ${b.processor} ${b.ram} ${b.storage} ${b.features} ${b.description}`
        );
        const scoreA = keywords.filter(k => textA.includes(k)).length;
        const scoreB = keywords.filter(k => textB.includes(k)).length;
        return scoreB - scoreA;
      });
    }
  }

  return results.slice(0, 10);
}
