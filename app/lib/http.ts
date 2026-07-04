// 案B：非JSON応答（Next の HTML 500 エラーページ、空ボディ、504 等）でも
// throw しない安全なレスポンスパーサ。
//
// 素の `await res.json()` は本文が JSON でないと SyntaxError を投げ、
// Safari では "The string did not match the expected pattern." になる。
// このヘルパーは content-type を確認し、parse に失敗しても例外を投げず null を返す。
// 呼び出し側は `const data = await readJson(res); if (!data) { ...フォールバック... }`
// のように書けば、異常応答でもユーザーにエラーを見せずに静かに劣化できる。
export async function readJson<T = unknown>(res: Response): Promise<T | null> {
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
