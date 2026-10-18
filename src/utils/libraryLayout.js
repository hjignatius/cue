// Does the Library collapse its three columns into one panel at a time?
//
// Pulled out of the view because it is the one rule here that must never go
// wrong in one direction: a PHONE always stacks. Three columns on a 390pt
// screen is not a layout, it is a smear — so the preference below can free a
// tablet and can never free a phone, whatever it is set to.
//
//   portraitPanels  any portrait phone OR tablet (orientation + max-width 1024)
//   tabletPortrait  the 768-1024pt slice of that: a tablet, never a phone
//   columnsOnTablet the user's preference, off by default
export function shouldStack({ portraitPanels, tabletPortrait, columnsOnTablet }) {
  if (!portraitPanels) return false;              // landscape, or a desktop width
  if (tabletPortrait && columnsOnTablet) return false;
  return true;
}
