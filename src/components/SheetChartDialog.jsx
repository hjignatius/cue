// A PDF imported into the Library that turned out to be one song's chord chart:
// load it as text, or keep the page. The same choice the editor's Load PDF
// offers, with the title Cue read for it, so the song lands named.
//
// A PDF with the song in it twice — Doctor Uke's, with chord diagrams and then
// chord names — offers each copy: the one Cue reads as text, the other as its
// pages, or the whole PDF as it came (chart.copies, sheetChart).
//
// No dimmed backdrop, as everywhere in Cue: nothing is lost by either answer.
const pagesWord = (nums) => (nums.length === 1 ? `page ${nums[0]}` : `pages ${nums[0]}–${nums.at(-1)}`);

export default function SheetChartDialog({ dark, fileName, chart, onText, onPage, onPages, onCancel }) {
  const lines = chart.text.split('\n').filter(l => l.trim());
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  const copies = chart.copies || null;
  const unread = copies ? copies.filter(c => !c.chart) : [];
  const total = copies ? copies.at(-1).pages.at(-1) : 0;
  const secondary = `w-full py-2 text-sm font-medium rounded-xl border transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={onCancel}>
      <div className={`w-[26rem] max-w-full max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
          <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
            {copies ? <>This PDF has the song {copies.length === 2 ? 'twice' : `${copies.length} times`}</> : <>There&rsquo;s a chord chart in this PDF</>}
          </h2>
          <p className={`text-xs break-words ${muted}`}>{fileName}</p>
          <p className={`text-sm ${muted}`}>
            {copies
              ? <>Cue can read the one on {pagesWord(chart.pages)} as text: a song you can transpose, restyle and capo. It can&rsquo;t read the chords on {unread.map(c => pagesWord(c.pages)).join(' or ')}, so that one comes in exactly as printed.</>
              : <>Load it as text and it becomes a song you can transpose, restyle and capo, and ink lands on the words. Keep it as a page and you get the sheet exactly as it was drawn.</>}
          </p>
        </div>

        {/* What was actually found, so the choice isn't blind. */}
        <div className={`rounded-xl border px-3 py-2 ${dark ? 'border-gray-700 bg-gray-950' : 'border-gray-200 bg-gray-50'}`}>
          <p className={`text-sm font-medium ${dark ? 'text-gray-100' : 'text-gray-900'}`}>
            {chart.title}{chart.artist ? <span className={`font-normal ${muted}`}> · {chart.artist}</span> : null}
          </p>
          <pre className={`mt-1 text-[11px] leading-snug font-mono whitespace-pre-wrap break-words ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{lines.slice(0, 6).join('\n')}</pre>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 tabular-nums">{lines.length} lines</p>
        </div>

        <div className="flex flex-col gap-2">
          <button onClick={onText} className="w-full py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors">
            {copies ? `Load ${pagesWord(chart.pages)} as text` : 'Load as text'}
          </button>
          {unread.map(c => (
            <button key={c.pages[0]} onClick={() => onPages(c.pages)} className={secondary}>
              Keep {pagesWord(c.pages)} as a PDF
            </button>
          ))}
          <button onClick={onPage} className={secondary}>
            {copies ? `Keep all ${total} pages as a PDF` : 'Keep it as a page'}
          </button>
          <button onClick={onCancel} className={`text-xs py-1 text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
