import { lazy, Suspense } from 'react';
import type { AbilityId, SkillId } from '../rules/srd/abilities';
import { abilityIcon, skillIcon } from '../components/sheetIcons';
import { Icon, type IconName } from '../icons/Icon';
import './RuleMark.css';
import type { ArtId } from './registry.generated';
const ArtImage=lazy(()=>import('./ArtImage').then(m=>({default:m.ArtImage})));
export const ABILITY_ART:Readonly<Record<AbilityId,ArtId>>={
 str:'kimi-core-ability-strength-v1',dex:'kimi-core-ability-dexterity-v1',con:'kimi-core-ability-constitution-v1',
 int:'kimi-core-ability-intelligence-v1',wis:'kimi-core-ability-wisdom-v1',cha:'kimi-core-ability-charisma-v1',
};
export const SKILL_ART:Readonly<Record<SkillId,ArtId>>={
 acrobatics:'kimi-core-skill-acrobatics-v1','animal-handling':'kimi-core-skill-animal-handling-v1',
 arcana:'kimi-core-sign-magic',athletics:'kimi-core-sign-athletics',deception:'kimi-core-skill-deception-v1',
 history:'kimi-core-skill-history-v1',insight:'kimi-core-skill-insight-v1',intimidation:'kimi-core-skill-intimidation-v1',
 investigation:'kimi-core-skill-investigation-v1',medicine:'kimi-core-sign-medicine',nature:'kimi-core-skill-nature-v1',
 perception:'kimi-core-skill-perception-v1',performance:'kimi-core-skill-performance-v1',persuasion:'kimi-core-skill-persuasion-v1',
 religion:'kimi-core-skill-religion-v1','sleight-of-hand':'kimi-core-skill-sleight-of-hand-v1',
 stealth:'kimi-core-icon-stealth-hood',survival:'kimi-core-skill-survival-v1',
};
function Mark({asset,icon,title}:{asset:ArtId;icon:IconName;title:string}) {
 const fallback=<Icon name={icon} size={16} title={title}/>;
 return <span className="rule-mark" title={title}><Suspense fallback={fallback}><ArtImage asset={asset} alt={title} width={24} sizes="24px" fallback={fallback}/></Suspense></span>;
}
export function AbilityMark({ability,title}:{ability:AbilityId;title:string}) {return <Mark asset={ABILITY_ART[ability]} icon={abilityIcon(ability)} title={title}/>;}
export function SkillMark({skill,title}:{skill:SkillId;title:string}) {return <Mark asset={SKILL_ART[skill]} icon={skillIcon(skill)} title={title}/>;}
