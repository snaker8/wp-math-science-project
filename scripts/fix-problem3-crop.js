/**
 * 문제 3의 크롭 이미지를 페이지 이미지에서 재생성
 * detection_annotations의 bbox를 사용하여 정확한 영역을 크롭
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.log('No env'); process.exit(1); }

const supabase = createClient(url, key);

const PROBLEM_ID = 'b6b8c2bc-4dbb-463d-af83-51983e55fe39';

async function main() {
  // 1. detection_annotations에서 bbox 정보 가져오기
  const { data: annot } = await supabase
    .from('detection_annotations')
    .select('*')
    .eq('problem_id', PROBLEM_ID)
    .single();

  if (!annot) {
    console.error('No detection annotation found');
    return;
  }

  console.log('=== Detection Info ===');
  console.log('Page:', annot.page_number);
  console.log('Page size:', annot.page_width, 'x', annot.page_height);
  console.log('BBox:', annot.bbox_x, annot.bbox_y, annot.bbox_w, annot.bbox_h);
  console.log('Image path:', annot.page_image_path);

  // 2. 페이지 이미지 다운로드
  console.log('\n다운로드 중:', annot.page_image_path);
  const { data: blob, error: dlErr } = await supabase.storage
    .from('source-files')
    .download(annot.page_image_path);

  if (dlErr || !blob) {
    console.error('Download failed:', dlErr?.message);
    return;
  }

  const pageBuffer = Buffer.from(await blob.arrayBuffer());
  console.log('페이지 이미지:', Math.round(pageBuffer.length / 1024), 'KB');

  // 3. 실제 이미지 크기 확인 (PDF 렌더링 해상도와 다를 수 있음)
  const metadata = await sharp(pageBuffer).metadata();
  console.log('실제 이미지 크기:', metadata.width, 'x', metadata.height);

  // 4. bbox로 크롭 영역 계산
  const imgW = metadata.width;
  const imgH = metadata.height;
  const cropX = Math.round(annot.bbox_x * imgW);
  const cropY = Math.round(annot.bbox_y * imgH);
  const cropW = Math.round(annot.bbox_w * imgW);
  const cropH = Math.round(annot.bbox_h * imgH);

  console.log(`\n크롭 영역: (${cropX}, ${cropY}) ${cropW}x${cropH}`);

  // 5. 크롭 실행
  const croppedBuffer = await sharp(pageBuffer)
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .png()
    .toBuffer();

  console.log('크롭 결과:', Math.round(croppedBuffer.length / 1024), 'KB');

  // 6. Storage에 업로드
  const cropPath = `problem-crops/${PROBLEM_ID}.png`;
  const { error: uploadErr } = await supabase.storage
    .from('source-files')
    .upload(cropPath, croppedBuffer, {
      contentType: 'image/png',
      upsert: true,
    });

  if (uploadErr) {
    console.error('업로드 실패:', uploadErr.message);
    return;
  }

  const cropUrl = `/api/storage/image?path=${encodeURIComponent(cropPath)}`;
  console.log('크롭 업로드 완료:', cropUrl);

  // 7. DB 업데이트 - images에 크롭 추가, ai_analysis.cropImageUrl 설정
  const { data: problem } = await supabase
    .from('problems')
    .select('ai_analysis, images')
    .eq('id', PROBLEM_ID)
    .single();

  const analysis = { ...(problem.ai_analysis || {}) };
  // Storage URL 형식으로 저장 (generate-figure가 다운로드할 수 있도록)
  const storageUrl = `${url}/storage/v1/object/public/source-files/${cropPath}`;
  analysis.cropImageUrl = storageUrl;

  const images = [
    { url: storageUrl, type: 'crop', label: '문제 크롭 (재생성)' }
  ];

  const { error: updateErr } = await supabase
    .from('problems')
    .update({
      ai_analysis: analysis,
      images: images,
    })
    .eq('id', PROBLEM_ID);

  if (updateErr) {
    console.error('DB 업데이트 실패:', updateErr);
  } else {
    console.log('\n✅ 완료! 크롭 이미지 재생성 + DB 업데이트 성공');
    console.log('이제 도형 재생성(✨) 버튼을 클릭하시면 올바른 그래프가 만들어집니다.');
  }
}

main().catch(console.error);
