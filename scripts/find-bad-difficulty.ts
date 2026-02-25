/**
 * 난이도 제약 위반 데이터 찾기
 */

async function main() {
  const { HS0_EXPANSION } = await import('./generate-expanded-types');
  const { HS1_EXPANSION } = await import('./expansion-data-hs1');
  const { HS2_EXPANSION, CAL_EXPANSION, PRB_EXPANSION, GEO_EXPANSION } = await import('./expansion-data-hs2-cal-prb-geo');
  const { MS_EXPANSION } = await import('./expansion-data-ms');
  const { ES12_EXPANSION, ES34_EXPANSION, ES56_EXPANSION } = await import('./expansion-data-es');

  const { HS0_V3, HS1_V3 } = await import('./expansion-v3-hs0-hs1');
  const { HS2_V3, CAL_V3, PRB_V3, GEO_V3 } = await import('./expansion-v3-hs2-cal-prb-geo');
  const { MS_V3 } = await import('./expansion-v3-ms');
  const { ES12_V3, ES34_V3, ES56_V3 } = await import('./expansion-v3-es');
  const { ELA_V3, ELC_V3, ELM_V3, ELP_V3, ELR_V3, ELT_V3, ELW_V3, EM1_V3, ET1_V3 } = await import('./expansion-v3-elective');
  const { HS0_SUP, HS1_SUP, MS_SUP, ES12_SUP, ES34_SUP, ES56_SUP } = await import('./expansion-v3-supplement');

  const { HS0_V4, HS1_V4, HS2_V4, CAL_V4, PRB_V4, GEO_V4 } = await import('./expansion-v4-hs');
  const { MS_V4, ES12_V4, ES34_V4, ES56_V4 } = await import('./expansion-v4-ms-es');
  const { HS0_V4S, HS1_V4S, HS2_V4S, MS_V4S, CAL_V4S, PRB_V4S, GEO_V4S, ES12_V4S, ES34_V4S, ES56_V4S, EL_V4S, FINAL_SUP } = await import('./expansion-v4-supplement');

  const groups: [string, any[]][] = [
    ['HS0_EXPANSION', HS0_EXPANSION], ['HS1_EXPANSION', HS1_EXPANSION],
    ['HS2_EXPANSION', HS2_EXPANSION], ['CAL_EXPANSION', CAL_EXPANSION],
    ['PRB_EXPANSION', PRB_EXPANSION], ['GEO_EXPANSION', GEO_EXPANSION],
    ['MS_EXPANSION', MS_EXPANSION], ['ES12_EXPANSION', ES12_EXPANSION],
    ['ES34_EXPANSION', ES34_EXPANSION], ['ES56_EXPANSION', ES56_EXPANSION],
    ['HS0_V3', HS0_V3], ['HS1_V3', HS1_V3], ['HS2_V3', HS2_V3],
    ['CAL_V3', CAL_V3], ['PRB_V3', PRB_V3], ['GEO_V3', GEO_V3],
    ['MS_V3', MS_V3], ['ES12_V3', ES12_V3], ['ES34_V3', ES34_V3], ['ES56_V3', ES56_V3],
    ['ELA_V3', ELA_V3], ['ELC_V3', ELC_V3], ['ELM_V3', ELM_V3], ['ELP_V3', ELP_V3],
    ['ELR_V3', ELR_V3], ['ELT_V3', ELT_V3], ['ELW_V3', ELW_V3], ['EM1_V3', EM1_V3], ['ET1_V3', ET1_V3],
    ['HS0_SUP', HS0_SUP], ['HS1_SUP', HS1_SUP], ['MS_SUP', MS_SUP],
    ['ES12_SUP', ES12_SUP], ['ES34_SUP', ES34_SUP], ['ES56_SUP', ES56_SUP],
    ['HS0_V4', HS0_V4], ['HS1_V4', HS1_V4], ['HS2_V4', HS2_V4],
    ['CAL_V4', CAL_V4], ['PRB_V4', PRB_V4], ['GEO_V4', GEO_V4],
    ['MS_V4', MS_V4], ['ES12_V4', ES12_V4], ['ES34_V4', ES34_V4], ['ES56_V4', ES56_V4],
    ['HS0_V4S', HS0_V4S], ['HS1_V4S', HS1_V4S], ['HS2_V4S', HS2_V4S], ['MS_V4S', MS_V4S],
    ['CAL_V4S', CAL_V4S], ['PRB_V4S', PRB_V4S], ['GEO_V4S', GEO_V4S],
    ['ES12_V4S', ES12_V4S], ['ES34_V4S', ES34_V4S], ['ES56_V4S', ES56_V4S],
    ['EL_V4S', EL_V4S], ['FINAL_SUP', FINAL_SUP],
  ];

  let totalBad = 0;
  for (const [name, arr] of groups) {
    const bad = arr.filter((t: any) =>
      t.difficulty_max > 5 || t.difficulty_max < 1 ||
      t.difficulty_min > 5 || t.difficulty_min < 1
    );
    if (bad.length > 0) {
      console.log(`\n⚠️  ${name}: ${bad.length}개 오류`);
      bad.forEach((t: any) => console.log(`   ${t.type_code} min=${t.difficulty_min} max=${t.difficulty_max}`));
      totalBad += bad.length;
    }
  }

  if (totalBad === 0) {
    console.log('✅ 모든 난이도 값 정상 (1~5 범위)');

    // 배치 600~700 범위 데이터 확인
    const all: any[] = [];
    for (const [, arr] of groups) all.push(...arr);
    const deduped = [...new Map(all.map(t => [t.type_code, t])).values()];
    console.log(`\n총 ${deduped.length}개 deduped`);
    console.log('배치 7 (index 600~699):');
    deduped.slice(600, 610).forEach((t: any) =>
      console.log(`  ${t.type_code} min=${t.difficulty_min} max=${t.difficulty_max} cog=${t.cognitive}`)
    );
  } else {
    console.log(`\n총 ${totalBad}개 수정 필요`);
  }
}

main().catch(console.error);
