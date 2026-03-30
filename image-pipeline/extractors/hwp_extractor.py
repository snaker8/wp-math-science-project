"""
HWP 5.0 파일에서 임베디드 이미지 추출
- OLE2 compound document (Microsoft CFB) 형식
- BinData 스트림에서 zlib 압축 해제 → 이미지 추출
"""

import struct
import zlib
import io
import os
from pathlib import Path
from typing import Optional

from PIL import Image


class HWPImageExtractor:
    """HWP 5.0 파일에서 임베디드 이미지를 추출한다."""

    def __init__(self, hwp_path: str):
        self.hwp_path = hwp_path
        with open(hwp_path, "rb") as f:
            self.data = f.read()

        if self.data[:4] != b"\xd0\xcf\x11\xe0":
            raise ValueError(f"OLE2 파일이 아닙니다: {hwp_path}")

        self._parse_header()

    def _parse_header(self):
        header = self.data[:512]
        self.sector_size = 1 << struct.unpack("<H", header[30:32])[0]
        self.fat = []
        difat = []
        for i in range(109):
            sid = struct.unpack("<I", header[76 + i * 4 : 80 + i * 4])[0]
            if sid != 0xFFFFFFFF and sid != 0xFFFFFFFE:
                difat.append(sid)
        for sid in difat:
            offset = 512 + sid * self.sector_size
            for i in range(self.sector_size // 4):
                val = struct.unpack(
                    "<I", self.data[offset + i * 4 : offset + i * 4 + 4]
                )[0]
                self.fat.append(val)
        self.dir_start = struct.unpack("<I", header[48:52])[0]

    def _read_chain(self, start_sid: int, max_size: Optional[int] = None) -> bytes:
        chain_data = bytearray()
        sid = start_sid
        visited: set[int] = set()
        while sid != 0xFFFFFFFE and sid != 0xFFFFFFFF and sid < len(self.fat):
            if sid in visited:
                break
            visited.add(sid)
            offset = 512 + sid * self.sector_size
            chain_data.extend(self.data[offset : offset + self.sector_size])
            if max_size and len(chain_data) >= max_size:
                break
            sid = self.fat[sid]
        return bytes(chain_data[:max_size]) if max_size else bytes(chain_data)

    def _get_entries(self) -> list[dict]:
        dir_data = self._read_chain(self.dir_start)
        entries = []
        for i in range(0, len(dir_data), 128):
            entry = dir_data[i : i + 128]
            if len(entry) < 128:
                break
            name_len = struct.unpack("<H", entry[64:66])[0]
            if name_len == 0:
                continue
            name = entry[:name_len].decode("utf-16-le", errors="ignore").rstrip("\x00")
            entry_type = entry[66]
            start_sid = struct.unpack("<I", entry[116:120])[0]
            size = struct.unpack("<I", entry[120:124])[0]
            if entry_type == 2:  # stream
                entries.append(
                    {"name": name, "start": start_sid, "size": size}
                )
        return entries

    def extract_images(
        self,
        output_dir: str,
        min_size: tuple[int, int] = (100, 100),
    ) -> list[dict]:
        """모든 BinData 이미지를 추출하여 output_dir에 PNG로 저장한다."""
        os.makedirs(output_dir, exist_ok=True)
        results = []

        for entry in self._get_entries():
            if not entry["name"].startswith("BIN"):
                continue

            raw = self._read_chain(entry["start"], entry["size"])

            # zlib 압축 해제 시도 (HWP BinData는 wbits=-15)
            try:
                img_data = zlib.decompress(raw, -15)
            except Exception:
                img_data = raw

            # 이미지 변환
            try:
                img = Image.open(io.BytesIO(img_data))
                w, h = img.size

                if w < min_size[0] or h < min_size[1]:
                    continue

                out_name = entry["name"].rsplit(".", 1)[0] + ".png"
                out_path = os.path.join(output_dir, out_name)
                img.save(out_path, "PNG")

                results.append(
                    {
                        "filename": out_name,
                        "filepath": out_path,
                        "original_name": entry["name"],
                        "width": w,
                        "height": h,
                        "mode": img.mode,
                        "size_bytes": os.path.getsize(out_path),
                    }
                )
            except Exception:
                continue

        return results


def extract_with_olefile(hwp_path: str, output_dir: str, min_size=(100, 100)):
    """olefile 패키지를 사용한 대안 추출 방법"""
    try:
        import olefile
    except ImportError:
        raise ImportError("olefile 패키지가 필요합니다: pip install olefile")

    ole = olefile.OleFileIO(hwp_path)
    results = []
    os.makedirs(output_dir, exist_ok=True)

    all_streams = ole.listdir()
    bindata_streams = [s for s in all_streams if "BinData" in "/".join(s)]
    print(f"[HWP olefile] 전체 스트림: {len(all_streams)}개, BinData: {len(bindata_streams)}개")

    # BinData가 없으면 전체 스트림 목록 출력 (디버그)
    if not bindata_streams:
        print(f"[HWP olefile] BinData 없음 — 스트림 목록:")
        for s in all_streams[:30]:
            print(f"  {'/'.join(s)}")

    skipped_small = 0
    skipped_parse = 0

    for stream_path in bindata_streams:
        stream_name = stream_path[-1]
        raw = ole.openstream(stream_path).read()

        # zlib 압축 해제 시도 (여러 방식)
        img_data = None
        for wbits in [-15, 15, -8, 31]:
            try:
                img_data = zlib.decompress(raw, wbits)
                break
            except Exception:
                continue
        if img_data is None:
            img_data = raw  # 압축 안 된 경우

        try:
            img = Image.open(io.BytesIO(img_data))
            w, h = img.size

            if w < min_size[0] or h < min_size[1]:
                skipped_small += 1
                continue


            out_name = stream_name.rsplit(".", 1)[0] + ".png"
            out_path = os.path.join(output_dir, out_name)
            img.save(out_path, "PNG")

            results.append(
                {
                    "filename": out_name,
                    "filepath": out_path,
                    "original_name": stream_name,
                    "width": w,
                    "height": h,
                    "mode": img.mode,
                    "size_bytes": os.path.getsize(out_path),
                }
            )
        except Exception as e:
            skipped_parse += 1
            # EMF/WMF 등 비이미지 스트림
            ext = stream_name.rsplit(".", 1)[-1].lower() if "." in stream_name else "?"
            print(f"[HWP olefile] 파싱 실패: {stream_name} ({ext}, {len(img_data)} bytes): {e}")
            continue

    print(f"[HWP olefile] 결과: {len(results)}개 추출, {skipped_small}개 크기 미달, {skipped_parse}개 파싱 실패")
    ole.close()
    return results
