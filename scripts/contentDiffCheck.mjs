// Does "what changed" agree with "something changed"?
//
// A hash can only say two versions differ. The share screen has only ever been
// able to pass that on, which is why a row going amber with no edit anybody
// remembers making was unanswerable. contentDiffFields names the fields instead
// — and its one hard contract is that it reports nothing exactly when the hash
// matches, because a diff that disagrees with the hash would send someone
// looking in the wrong place with more confidence than before.
//
// Run: node scripts/contentDiffCheck.mjs
import { contentDiffFields, contentHash } from '../src/utils/contentHash.js';
let pass=0, fail=0;
const t=(l,got,want)=>{const ok=JSON.stringify(got)===JSON.stringify(want); if(ok)pass++;else{fail++;console.log('FAIL',l,'got',JSON.stringify(got),'want',JSON.stringify(want));}};
const base = { text:'G\nhi', metadata:{title:'T',artist:'A',key:'G',tempo:'100',duration:'3:00',timeSig:'4/4',youtubeUrl:''}, chordStyle:'over', previewMode:'over', fullPage:false, embed:false, type:'text' };
t('identical', contentDiffFields(base, base), []);
t('duration only', contentDiffFields(base, {...base, metadata:{...base.metadata, duration:'3:42'}}), ['the duration']);
t('full page only', contentDiffFields(base, {...base, fullPage:true}), ['the full-page setting']);
t('words', contentDiffFields(base, {...base, text:'G\nbye'}), ['the words and chords']);
t('several', contentDiffFields(base, {...base, text:'x', metadata:{...base.metadata, key:'A'}}), ['the words and chords','the key']);
t('a missing field reads as empty, not as a difference', contentDiffFields({text:'G\nhi', metadata:{title:'T',artist:'A',key:'G',tempo:'100',duration:'3:00',timeSig:'4/4'}, chordStyle:'over', previewMode:'over', type:'text'}, base), []);
// The contract that matters: the diff must be empty exactly when the hash matches.
const pairs = [[base, base], [base, {...base, embed:true}], [base, {...base, metadata:{...base.metadata, tempo:'120'}}]];
for (const [a,b] of pairs) t(`diff agrees with the hash`, contentDiffFields(a,b).length === 0, contentHash(a) === contentHash(b));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
