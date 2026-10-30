// A PDF imported into the Library that turned out to be one song's chord chart:
// load it as text, or keep the page. The same choice the editor's Load PDF
// offers, with the title Cue read for it, so the song lands named.
//
// No dimmed backdrop, as everywhere in Cue: nothing is lost by either answer.
export default function SheetChartDialog({ dark, fileName, chart, onText, onPage, onCancel }) {
  const lines = chart.text.split('\n').filter(l => l.trim());
  const muted = dark ? 'text-gray-400' : 'text-gray-500';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={onCancel}>
      <div className={`w-[26rem] max-w-full max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-gray-900 border border-gray-700' : 'bg-white border border-gray-200'}`} onClick={e => e.stopPropagation()}>
        <div className="flex flex-col gap-1">
          <h2 className={`text-base font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>There&rsquo;s a chord chart in this PDF</h2>
          <p className={`text-xs break-words ${muted}`}>{fileName}</p>
          <p className={`text-sm ${muted}`}>
            Load it as text and it becomes a song you can transpose, restyle and capo, and ink lands on the words. Keep it as a page and you get the sheet exactly as it was drawn.
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
            Load as text
          </button>
          <button onClick={onPage}
            className={`w-full py-2 text-sm font-medium rounded-xl border transition-colors ${dark ? 'border-gray-700 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'}`}>
            Keep it as a page
          </button>
          <button onClick={onCancel} className={`text-xs py-1 text-center transition-colors ${dark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'}`}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
