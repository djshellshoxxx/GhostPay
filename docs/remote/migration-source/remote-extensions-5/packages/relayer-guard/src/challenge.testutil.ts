/** Independent solver: parses the prompt text and recomputes the answer. */
export function solveQuestion(q: string): string {
  let m: RegExpMatchArray | null;
  if ((m = /^What is (\d+) ([+\-*]) (\d+)\?$/u.exec(q))) {
    const a = Number(m[1]);
    const b = Number(m[3]);
    return String(m[2] === '+' ? a + b : m[2] === '-' ? a - b : a * b);
  }
  if ((m = /^What is (\d+) \* (\d+) \+ (\d+)\?$/u.exec(q)))
    return String(Number(m[1]) * Number(m[2]) + Number(m[3]));
  if ((m = /^Counting from 1, which letter is number (\d+) of the word "(\w+)"\?$/u.exec(q))) {
    return (m[2] as string)[Number(m[1]) - 1] as string;
  }
  if ((m = /^What number comes next: (\d+), (\d+), (\d+), (\d+), \?$/u.exec(q))) {
    const t = m.slice(1, 5).map(Number) as [number, number, number, number];
    return t[1] - t[0] === t[2] - t[1] ? String(t[3] + (t[1] - t[0])) : String(t[3] * 2);
  }
  if ((m = /^How many times does the letter "(\w)" appear in the word "(\w+)"\?$/u.exec(q))) {
    return String([...(m[2] as string)].filter((c) => c === m?.[1]).length);
  }
  if ((m = /^Type the word "(\w+)" backwards\.$/u.exec(q))) return [...(m[1] as string)].reverse().join('');
  if ((m = /^Which of these words is the (longest|shortest): (\w+), (\w+), (\w+)\?$/u.exec(q))) {
    const ws = m.slice(2, 5);
    return [...ws].sort((a, b) =>
      m?.[1] === 'longest' ? b.length - a.length : a.length - b.length,
    )[0] as string;
  }
  if (
    (m = /^Which of these words comes (first|last) in alphabetical order: (\w+), (\w+), (\w+)\?$/u.exec(q))
  ) {
    const s = m.slice(2, 5).sort();
    return (m[1] === 'first' ? s[0] : s[2]) as string;
  }
  throw new Error(`unrecognised question: ${q}`);
}
