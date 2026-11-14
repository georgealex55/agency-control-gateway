/** Staging-only tenant-authorized opportunity pipeline service; injected pools only. */
export function createClientPipelineService(access) {
  if (typeof access?.withSession !== 'function') throw new TypeError('Trusted access required');
  const idOk = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
  async function run(token, clientId, operation) {
    if (!idOk(clientId)) throw new TypeError('Invalid client');
    return access.withSession(token, clientId, 'app', async (pool, binding) => {
      if (binding.clientId !== clientId || binding.role !== 'app') throw new Error('Client access denied');
      const conn = await pool.connect();
      try { return await operation(conn); } finally { conn.release(); }
    });
  }
  function mapRow(row) {
    if (!idOk(row?.id) || !idOk(row?.stage_id) || typeof row?.title !== 'string' ||
        !idOk(row?.pipeline_id)) throw new Error('Invalid opportunity row');
    return Object.freeze({id:row.id,pipelineId:row.pipeline_id,stageId:row.stage_id,title:row.title});
  }
  return Object.freeze({
    async list(token, clientId, pipelineId, {limit=50}={}) {
      if (!idOk(pipelineId) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new TypeError('Invalid pipeline query');
      return run(token,clientId,async conn => {
        const result = await conn.query({text:'SELECT id, pipeline_id, stage_id, title FROM reach_opportunities WHERE pipeline_id = $1 ORDER BY id LIMIT $2',values:[pipelineId,limit],query_timeout:3000});
        if (!Array.isArray(result?.rows)) throw new Error('Invalid opportunity response');
        return Object.freeze({clientId,pipelineId,opportunities:result.rows.map(mapRow)});
      });
    },
    async move(token, clientId, {opportunityId,pipelineId,stageId}) {
      if (![opportunityId,pipelineId,stageId].every(idOk)) throw new TypeError('Invalid stage change');
      return run(token,clientId,async conn => {
        // Stage must belong to this pipeline; a failed or cross-pipeline update changes nothing.
        const result = await conn.query({text:'UPDATE reach_opportunities AS o SET stage_id = $3 WHERE o.id = $1 AND o.pipeline_id = $2 AND EXISTS (SELECT 1 FROM reach_pipeline_stages AS s WHERE s.id = $3 AND s.pipeline_id = $2) RETURNING o.id, o.pipeline_id, o.stage_id, o.title',values:[opportunityId,pipelineId,stageId],query_timeout:3000});
        if (!Array.isArray(result?.rows) || result.rows.length > 1) throw new Error('Invalid stage change response');
        if (result.rows.length === 0) return Object.freeze({updated:false});
        return Object.freeze({updated:true,opportunity:mapRow(result.rows[0])});
      });
    }
  });
}
