import React from 'react';
import {LaserAssemblyWorkspace} from './LaserAssemblyWorkspace';
import type {NestingTransfer} from '../../utils/nestingEngine';
import type {Material,Machine,ProductionOrder} from '../../types';
interface DesignStudioProps {
 initialModel?:string;
 initialArtifact?:{id:string;title:string;svgString:string;thickness_mm:number}|null;
 materials?:Material[];machines?:Machine[];
 onSendToNesting?:(part:NestingTransfer)=>void;
 onSendToCam?:(gcode:string,machineType:'laser'|'router')=>void;
 onSendToQuote?:(item:{description:string;materialId:string;cutLength_mm:number;engraveArea_cm2:number;machineId:string;quantity:number;width_mm:number;height_mm:number})=>void;
 onSendToProduction?:(order:Partial<ProductionOrder>)=>Promise<void>;
}
/** CAD and vector studios share one persisted geometry, not independent demonstration meshes. */
export const DesignStudioView:React.FC<DesignStudioProps>=props=><LaserAssemblyWorkspace {...props}/>;
