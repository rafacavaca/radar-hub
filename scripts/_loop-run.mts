import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
process.env.RADAR_ADMIN_CONTEXT = "1"; // contexto admin p/ o coletor (igual ao cron)
const { runAsOrgCollector } = await import("@/lib/db/collector-org");
const { runRadarLoop } = await import("@/lib/loop");
const ORG = "98e90ffe-1ece-4c05-8c09-43acaafcae7f";
const t0 = Date.now();
try {
  const r = await runAsOrgCollector(ORG, () => runRadarLoop({ force: true }));
  console.log(`\nloop OK em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`items=${r.items.length} readings=${r.readings?.length ?? 0} events=${r.events?.length ?? 0} plays=${r.relationshipPlays?.length ?? 0} sales=${r.salesReadings?.length ?? 0} failures=${r.failures?.length ?? 0}`);
  for (const f of r.failures ?? []) console.log("  FALHA:", f.slice(0, 130));
} catch (e) {
  console.log(`\nloop LANÇOU em ${((Date.now() - t0) / 1000).toFixed(0)}s:`, (e as Error).message.slice(0, 220));
}
