export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function tryFetchAsBlob(url: string) {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("获取结果图片失败");
  return await res.blob();
}

