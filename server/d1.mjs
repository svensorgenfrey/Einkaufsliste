/** The same optimistic revision contract as the CouchDB adapter, using atomic SQL. */
export class D1Repository {
  constructor(database) { this.database = database; this.kind = 'd1'; }
  async health() { await this.database.prepare('SELECT 1 FROM shares LIMIT 1').first(); }
  async get(id) {
    // Avoid stale replicas during merge/claim/revocation checks.
    const primary = this.database.withSession('first-primary');
    const row = await primary.prepare('SELECT revision, document FROM shares WHERE id = ?').bind(id).first();
    return row ? {...JSON.parse(row.document), _rev:row.revision} : null;
  }
  async put(document) {
    const revision = `${Number(document._rev?.split('-')[0] || 0)+1}-${crypto.randomUUID()}`;
    const {_rev, _id, ...stored} = document;
    const json = JSON.stringify(stored);
    const result = _rev
      ? await this.database.prepare('UPDATE shares SET revision = ?, document = ? WHERE id = ? AND revision = ?').bind(revision,json,document.id,_rev).run()
      : await this.database.prepare('INSERT INTO shares (id, revision, document) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(document.id,revision,json).run();
    if (result.meta.changes !== 1) throw Object.assign(new Error('Version geändert.'),{status:409});
    return {...stored,_rev:revision};
  }
}
