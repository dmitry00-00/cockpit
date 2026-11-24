/** User-selectable display lens; this never changes the campaign's cosmology entity. */
export type CosmologyViewId = 'wheel' | 'tree' | 'axis';

/** Isolated data contract for the 4e post-Spellplague cosmology view. */
export interface PostSpellplagueNode {
  id: string;
  name: string;
  summary: string;
  source: string;
  sourceUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'world' | 'reflection' | 'transitive' | 'elemental' | 'divine' | 'abyss';
}

export interface PostSpellplagueLink {
  id: string;
  from: string;
  to: string;
  label: string;
  summary: string;
  source: string;
  sourceUrl: string;
  style: 'solid' | 'reflection' | 'containment';
}

export interface PostSpellplagueModel {
  title: string;
  edition: string;
  sourceSlice: string;
  contextNote: string;
  source: string;
  sourceUrl: string;
  nodes: readonly PostSpellplagueNode[];
  links: readonly PostSpellplagueLink[];
}
