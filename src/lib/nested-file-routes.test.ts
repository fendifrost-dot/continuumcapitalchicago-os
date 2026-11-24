import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const routesDir = join(root, "src/routes/_authenticated");

function routeFiles(): string[] {
  return readdirSync(routesDir).filter((name) => name.endsWith(".tsx"));
}

function routeUpdate(tree: string, constName: string): string {
  const start = tree.indexOf(`const ${constName} =`);
  assert.ok(start >= 0, `${constName} is missing from the route tree`);
  const end = tree.indexOf("\nconst ", start + 1);
  return tree.slice(start, end === -1 ? undefined : end);
}

test("parent file routes render an outlet and keep the page on an index route", () => {
  const files = routeFiles();
  const layouts = files.filter((name) => {
    const stem = name.slice(0, -".tsx".length);
    if (stem.includes(".") || stem === "route") return false;
    return files.some((other) => other !== name && other.startsWith(`${stem}.`));
  });

  assert.deepEqual(layouts.sort(), ["clients.tsx", "companies.tsx"]);

  for (const layoutName of layouts) {
    const stem = layoutName.slice(0, -".tsx".length);
    const layout = readFileSync(join(routesDir, layoutName), "utf8");
    const indexName = `${stem}.index.tsx`;
    assert.ok(files.includes(indexName), `${indexName} is missing`);

    assert.match(layout, /component:\s*Outlet\b|<Outlet\s*\/>/);
    assert.equal(/PageHeader|useQuery\(/.test(layout), false, `${layoutName} must stay a layout`);
    assert.match(layout, new RegExp(`createFileRoute\\("/_authenticated/${stem}"\\)`));

    const index = readFileSync(join(routesDir, indexName), "utf8");
    assert.match(index, new RegExp(`createFileRoute\\("/_authenticated/${stem}/"\\)`));

    const detailName = files.find((name) => name.startsWith(`${stem}.$`));
    assert.ok(detailName, `${stem} is missing a detail route`);
    const detail = readFileSync(join(routesDir, detailName), "utf8");
    assert.match(detail, new RegExp(`createFileRoute\\("/_authenticated/${stem}/\\$`));
  }
});

test("the client detail route still renders the credit file", () => {
  const detail = readFileSync(join(routesDir, "clients.$id.tsx"), "utf8");
  assert.match(detail, /TabsTrigger value="credit"/);
  assert.match(detail, /<CreditFileStaff /);
  assert.match(detail, /<ClientMailingAddress /);
});

test("the generated route tree mounts detail and list as siblings under the layout", () => {
  const tree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");

  for (const name of ["Clients", "Companies"]) {
    const indexBlock = routeUpdate(tree, `Authenticated${name}IndexRoute`);
    const detailBlock = routeUpdate(tree, `Authenticated${name}IdRoute`);
    assert.match(indexBlock, /id: '\/'/);
    assert.match(indexBlock, new RegExp(`getParentRoute: \\(\\) => Authenticated${name}Route`));
    assert.match(detailBlock, /id: '\/\$id'/);
    assert.match(detailBlock, new RegExp(`getParentRoute: \\(\\) => Authenticated${name}Route`));
    assert.match(tree, new RegExp(`'/_authenticated/${name.toLowerCase()}/'`));
    assert.match(
      tree,
      new RegExp(`'/${name.toLowerCase()}': typeof Authenticated${name}IndexRoute`),
    );
  }

  assert.match(tree, /fullPath: '\/clients\/\$id'/);
  assert.match(tree, /fullPath: '\/companies\/\$id'/);
});
