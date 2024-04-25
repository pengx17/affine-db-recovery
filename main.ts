import betterSqlite3 from "better-sqlite3";
import { nanoid } from "nanoid";
import { Schema, DocCollection } from "@blocksuite/store";

import * as Y from "yjs";

let updatesMap: Map<string | undefined, Uint8Array[]> = new Map();
let rootDoc: Y.Doc = new Y.Doc();
let db = betterSqlite3(process.argv.at(-1));

function parseUpdateRows() {
  const rows = db.prepare("SELECT data, doc_id FROM updates").all();
  rows.forEach((row: any) => {
    const id = row.doc_id || undefined;
    const rows = updatesMap.get(id) ?? [];
    updatesMap.set(id, rows);
    rows.push(row.data);
  });
  return rows;
}

function recoverRootDoc() {
  const globalBlockSuiteSchema = new Schema();
  const workspace = new DocCollection({
    schema: globalBlockSuiteSchema,
    id: nanoid(8),
  });
  for (const [id, bins] of updatesMap) {
    if (!id) continue;
    const doc = workspace.createDoc({
      id: id,
    });
    doc.spaceDoc.getMap("spaces");
    bins.forEach((bin) => Y.applyUpdate(doc.spaceDoc, bin));
    // find title from page block
    const title = Object.values(doc.spaceDoc.get("blocks").toJSON()).find(
      (b: any) => {
        return b["prop:title"];
      }
    )?.["prop:title"];
    workspace.setDocMeta(id, {
      title: title || "",
    });
  }
  rootDoc = workspace.doc;
  // 3. iterate updates and insert to updates
  const rootBin = Y.encodeStateAsUpdate(rootDoc);
  db.prepare("INSERT INTO updates (data) VALUES (?)").run(rootBin);
}

//////////////////

const updateRows = parseUpdateRows();

console.log("read updates from db", updateRows.length);
const missingRootDoc = updatesMap.get(undefined)?.length === 0;

console.warn("missingRootDoc", missingRootDoc);

recoverRootDoc();
console.log("recovered root");

db.close();
console.log("db closed");
