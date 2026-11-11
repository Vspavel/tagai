const keys=['source','medium','campaign','content','term'];
export function cleanAttribution(value,legacySource=''){
  const touch=v=>{const result={};for(const k of keys)if(typeof v?.[k]==='string'&&/^[a-zA-Z0-9_.~-]{1,80}$/.test(v[k]))result[k]=v[k];
    if(!result.source)return {};
    if(typeof v.landing==='string'&&/^\/(?:en|fr|el|es|it|de|ru)\/(?:partners\/|visits\/|encounters\/(?:sarah-awad|sanya-kantarovsky)\/)?$/.test(v.landing))result.landing=v.landing;
    return result;
  };
  const first=touch(value?.first),last=touch(value?.last);
  if(!first.source&&/^[a-zA-Z0-9_.~-]{1,80}$/.test(legacySource))first.source=legacySource;
  return {first,last:last.source?last:{...first}};
}
