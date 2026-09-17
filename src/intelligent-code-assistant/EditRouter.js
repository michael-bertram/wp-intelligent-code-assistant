import { __ } from '@wordpress/i18n';
import { Warning } from '@wordpress/block-editor';
import { Spinner } from '@wordpress/components';
import { createBlock, parse, serialize } from '@wordpress/blocks';
import { useDispatch, useSelect } from '@wordpress/data';
import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import Edit from './edit';

const decodeHtml=(value='')=>{if(!value||typeof document==='undefined')return value||'';const textarea=document.createElement('textarea');textarea.innerHTML=value;return textarea.value;};
const htmlToText=(html='')=>{if(!html||typeof document==='undefined')return '';const container=document.createElement('div');container.innerHTML=html;const root=container.firstElementChild;return decodeHtml(root?root.innerHTML:html);};
const extractSavedValue=(block)=>htmlToText(block?.originalContent||block?.innerHTML||'');
const extractCodeFromRawContent=(raw='')=>{if(!raw)return '';const match=raw.match(/<!--\s+wp:wpe\/code-content(?:\s+\{[\s\S]*?\})?\s*-->([\s\S]*?)<!--\s+\/wp:wpe\/code-content\s+-->/i);return match?htmlToText(match[1]):'';};
const normalizeCanonicalBlock=(block,rawCode='')=>{if(!block)return block;const innerBlocks=(block.innerBlocks||[]).map((inner)=>normalizeCanonicalBlock(inner,rawCode));let attributes={...(block.attributes||{})};if(block.name==='wpe/code-content'){const saved=attributes.code??attributes.content??extractSavedValue(block)??rawCode;const code=saved||rawCode||'';attributes={...attributes,code,content:code};}if(block.name==='wpe/code-header'&&!attributes.content){const header=extractSavedValue(block);if(header)attributes.content=header;}return{...block,attributes,innerBlocks};};
const cloneBlockTree=(block)=>createBlock(block.name,{...(block.attributes||{})},(block.innerBlocks||[]).map(cloneBlockTree));
const getRawRecordContent=(record)=>typeof record?.content==='string'?record.content:(record?.content?.raw||'');
const getCanonicalAssistant=(record)=>{const raw=getRawRecordContent(record);if(!raw)return null;const assistant=parse(raw).find((block)=>block?.name==='wpe/intelligent-code-assistant')||null;return normalizeCanonicalBlock(assistant,extractCodeFromRawContent(raw));};
const getSharedAttributes=(attributes={})=>{const{id,tutorialContextOverride,codeExampleId,...shared}=attributes;return shared;};
const getSyncSignature=(block)=>{if(!block)return '';const simplify=(candidate)=>({name:candidate.name,attributes:candidate.attributes||{},innerBlocks:(candidate.innerBlocks||[]).map(simplify)});return JSON.stringify(simplify(block));};

function CodeExampleProxy({codeExampleId,editProps}){
    const entityId=Number(codeExampleId||0);const{clientId,attributes}=editProps;
    const{editEntityRecord,saveEditedEntityRecord}=useDispatch('core');const{updateBlockAttributes,replaceInnerBlocks}=useDispatch('core/block-editor');
    const[isHydrated,setIsHydrated]=useState(false);const[saveError,setSaveError]=useState('');const hydratedEntityId=useRef(0);const saveTimer=useRef(null);const lastSyncedSignature=useRef('');
    const{record,isResolving}=useSelect((select)=>{const core=select('core');const query={context:'edit'};return{record:entityId?core.getEntityRecord('postType','ica_code_example',entityId,query):null,isResolving:entityId?core.isResolving('getEntityRecord',['postType','ica_code_example',entityId,query]):false};},[entityId]);
    const rawRecordContent=getRawRecordContent(record);const canonicalAssistant=useMemo(()=>getCanonicalAssistant(record),[rawRecordContent]);
    const localBlock=useSelect((select)=>select('core/block-editor').getBlock(clientId),[clientId]);const localSignature=getSyncSignature(localBlock);
    useEffect(()=>()=>{if(saveTimer.current)window.clearTimeout(saveTimer.current);},[]);
    useEffect(()=>{if(!canonicalAssistant||hydratedEntityId.current===entityId)return;const canonicalAttributes=canonicalAssistant.attributes||{};const instanceAttributes=attributes||{};updateBlockAttributes(clientId,{...getSharedAttributes(canonicalAttributes),codeExampleId:entityId,...(instanceAttributes.id?{id:instanceAttributes.id}:{}),...(Object.prototype.hasOwnProperty.call(instanceAttributes,'tutorialContextOverride')?{tutorialContextOverride:instanceAttributes.tutorialContextOverride}:{})});replaceInnerBlocks(clientId,(canonicalAssistant.innerBlocks||[]).map(cloneBlockTree),false);hydratedEntityId.current=entityId;lastSyncedSignature.current='';setIsHydrated(true);},[canonicalAssistant,entityId,clientId,attributes,updateBlockAttributes,replaceInnerBlocks]);
    useEffect(()=>{if(!isHydrated||!localBlock||!canonicalAssistant||!localSignature)return;if(lastSyncedSignature.current===localSignature)return;const localAttributes=localBlock.attributes||{};const canonicalAttributes=canonicalAssistant.attributes||{};
        // Canonical content owns its children and must serialize as an unlinked
        // ICA block. Only the article proxy carries codeExampleId = entityId.
        const nextCanonicalAttributes={...canonicalAttributes,...getSharedAttributes(localAttributes),codeExampleId:0};
        if(Object.prototype.hasOwnProperty.call(canonicalAttributes,'id'))nextCanonicalAttributes.id=canonicalAttributes.id;else delete nextCanonicalAttributes.id;if(Object.prototype.hasOwnProperty.call(canonicalAttributes,'tutorialContextOverride'))nextCanonicalAttributes.tutorialContextOverride=canonicalAttributes.tutorialContextOverride;else delete nextCanonicalAttributes.tutorialContextOverride;
        const nextCanonicalBlock=createBlock('wpe/intelligent-code-assistant',nextCanonicalAttributes,(localBlock.innerBlocks||[]).map(cloneBlockTree));const nextContent=serialize([nextCanonicalBlock]);lastSyncedSignature.current=localSignature;setSaveError('');editEntityRecord('postType','ica_code_example',entityId,{content:nextContent});if(saveTimer.current)window.clearTimeout(saveTimer.current);saveTimer.current=window.setTimeout(async()=>{try{await saveEditedEntityRecord('postType','ica_code_example',entityId);}catch(error){setSaveError(error?.message||__('The Code Example could not be saved.','intelligent-code-assistant'));}},700);
    },[isHydrated,localBlock,localSignature,canonicalAssistant,entityId,editEntityRecord,saveEditedEntityRecord]);
    if(isResolving&&!record)return <Spinner/>;if(!record||!canonicalAssistant)return <Warning>{__('The selected Code Example could not be loaded.','intelligent-code-assistant')}</Warning>;if(!isHydrated)return <Spinner/>;
    return <><Edit {...editProps} isCodeExampleProxy={true}/>{saveError&&<span className="screen-reader-text" role="status">{saveError}</span>}</>;
}

export default function EditRouter(props){const{attributes}=props;const currentPostType=useSelect((select)=>select('core/editor')?.getCurrentPostType?.()||'',[]);const codeExampleId=Number(attributes.codeExampleId||0);const isArticleReference=currentPostType!=='ica_code_example'&&codeExampleId>0;if(!isArticleReference)return <Edit {...props}/>;return <CodeExampleProxy codeExampleId={codeExampleId} editProps={props}/>;}
