import React from 'react';
import {LaserAssemblyWorkspace} from './LaserAssemblyWorkspace';
import type {NestingTransfer} from '../../utils/nestingEngine';
import type {Material,Machine} from '../../types';
interface DesignStudioProps {
 initialModel?:string;
 initialArtifact?:{id:string;title:string;svgString:string;thickness_mm:number}|null;
 materials?:Material[];machines?:Machine[];
 onSendToNesting?:(part:NestingTransfer)=>void;
 onSendToQuote?:(part:{description:string;cutLength_mm:number;materialCategory:string})=>void;
}
/** CAD and vector studios share one persisted geometry, not independent demonstration meshes. */
export const DesignStudioView:React.FC<DesignStudioProps>=props=><LaserAssemblyWorkspace {...props}/>;
