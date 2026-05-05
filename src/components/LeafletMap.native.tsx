/**
 * LeafletMap — OpenStreetMap-based interactive map via WebView.
 *
 * Works on iOS, Android, and web. Free, no API key.
 * Markers are numbered by rank. Tapping a marker calls onMarkerTap.
 * React Native can highlight a marker via the `selectedId` prop.
 */

import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import WebView from "react-native-webview";

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title: string;
  imageUrl?: string | null;
  description?: string | null;
}

interface LeafletMapProps {
  markers: MapMarker[];
  selectedId: string | null;
  userLat?: number | null;
  userLng?: number | null;
  radiusKm?: number | null;
  onMarkerTap?: (id: string) => void;
}

const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="initial-scale=1,maximum-scale=1,user-scalable=no,width=device-width"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:#1e293b}
#map{width:100%;height:100%}
.leaflet-tile-pane{filter:brightness(0.85) saturate(0.9)}
.pin{border-radius:50%;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;font-weight:700;color:#fff;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,0.55);transition:transform .15s}
.pin:active{transform:scale(1.15)}
.pn{background:#6366f1;width:28px;height:28px;font-size:11px}
.ps{background:#f59e0b;width:34px;height:34px;font-size:13px}
.pu{background:#22c55e;width:14px;height:14px;box-shadow:0 0 0 5px rgba(34,197,94,0.25)}
/* Tooltip card */
#tip{position:fixed;z-index:9999;pointer-events:none;opacity:0;transition:opacity 0.18s;max-width:220px;min-width:160px;background:#1e293b;border:1px solid #334155;border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.6)}
#tip.show{opacity:1;pointer-events:none}
#tip-img{width:100%;height:110px;object-fit:cover;display:block;background:#0f172a}
#tip-img.hidden{display:none}
#tip-body{padding:10px 12px 12px}
#tip-title{font-size:13px;font-weight:700;color:#f1f5f9;line-height:17px;margin-bottom:5px}
#tip-desc{font-size:11px;color:#94a3b8;line-height:15px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
</style>
</head>
<body>
<div id="map"></div>
<div id="tip">
  <img id="tip-img" src="" alt=""/>
  <div id="tip-body">
    <div id="tip-title"></div>
    <div id="tip-desc"></div>
  </div>
</div>
<script>
var map=L.map('map',{zoomControl:false});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
map.setView([20,0],2);
var _m={},_sel=null,_um=null,_rc=null;
var _userLat=null,_userLng=null,_radiusM=null,_hasMarkers=false;
var _tip=document.getElementById('tip');
var _tipImg=document.getElementById('tip-img');
var _tipTitle=document.getElementById('tip-title');
var _tipDesc=document.getElementById('tip-desc');
var _tipTimer=null;

function _showTip(x,y,item){
  clearTimeout(_tipTimer);
  _tipTitle.textContent=item.title||'';
  _tipDesc.textContent=item.description||'';
  if(item.imageUrl){_tipImg.src=item.imageUrl;_tipImg.classList.remove('hidden');}
  else{_tipImg.src='';_tipImg.classList.add('hidden');}
  // Position: above and to the right of pin, clamp to screen edges
  var tw=230,th=item.imageUrl?220:90;
  var lx=Math.min(x+14,window.innerWidth-tw-8);
  var ly=Math.max(y-th-14,8);
  _tip.style.left=lx+'px';
  _tip.style.top=ly+'px';
  _tip.classList.add('show');
}
function _hideTip(delay){
  clearTimeout(_tipTimer);
  _tipTimer=setTimeout(function(){_tip.classList.remove('show');},delay||0);
}

function _icon(n,sel){
  var c=sel?'pin ps':'pin pn',s=sel?34:28;
  return L.divIcon({className:'',html:'<div class="'+c+'">'+n+'</div>',iconSize:[s,s],iconAnchor:[s/2,s/2]});
}
function setMarkers(list){
  Object.values(_m).forEach(function(o){o.m.remove();});
  _m={};_sel=null;_hideTip(0);
  var pts=[];
  list.forEach(function(item,i){
    if(item.lat==null||item.lng==null)return;
    var mk=L.marker([item.lat,item.lng],{icon:_icon(i+1,false)}).addTo(map);
    // Desktop: hover tooltip
    mk.on('mouseover',function(e){
      var p=e.originalEvent;
      _showTip(p.clientX,p.clientY,item);
    });
    mk.on('mousemove',function(e){
      var p=e.originalEvent;
      _showTip(p.clientX,p.clientY,item);
    });
    mk.on('mouseout',function(){_hideTip(200);});
    // Mobile / click: show tip briefly then fire tap
    mk.on('click',function(e){
      var p=e.originalEvent;
      _showTip(p.clientX,p.clientY,item);
      _hideTip(2200);
      _send({type:'tap',id:item.id});
    });
    _m[item.id]={m:mk,n:i+1,data:item};
    pts.push([item.lat,item.lng]);
  });
  if(pts.length>0)_hasMarkers=true;
  if(!_sel){
    if(pts.length===1){map.setView(pts[0],13);}
    else if(pts.length>1){try{map.fitBounds(pts,{padding:[45,45],maxZoom:12});}catch(e){map.setView(pts[0],12);}}
  }
}
function selectMarker(id){
  if(_sel&&_m[_sel]){var p=_m[_sel];p.m.setIcon(_icon(p.n,false));}
  _hideTip(0);
  _sel=id;
  if(id&&_m[id]){var c=_m[id];c.m.setIcon(_icon(c.n,true));map.flyTo(c.m.getLatLng(),13,{animate:true,duration:0.5});}
}
function _drawRadius(){
  if(_rc){_rc.remove();_rc=null;}
  if(_userLat==null||_radiusM==null)return;
  _rc=L.circle([_userLat,_userLng],{radius:_radiusM,color:'#6366f1',fillColor:'#6366f1',fillOpacity:0.07,weight:1.5,opacity:0.4,dashArray:'6 4',interactive:false}).addTo(map);
  if(!_hasMarkers){map.fitBounds(_rc.getBounds(),{padding:[20,20]});}
}
function setRadius(radiusM){_radiusM=radiusM;_drawRadius();}
function setUser(lat,lng){
  if(_um)_um.remove();
  _userLat=lat;_userLng=lng;
  _um=L.marker([lat,lng],{icon:L.divIcon({className:'',html:'<div class="pin pu"></div>',iconSize:[14,14],iconAnchor:[7,7]})}).addTo(map);
  _drawRadius();
}
map.on('click',function(){_hideTip(0);});
function _send(d){try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(d));}catch(e){}}
function _handle(raw){
  try{
    var msg=typeof raw==='string'?JSON.parse(raw):raw;
    if(msg.type==='markers')setMarkers(msg.data);
    else if(msg.type==='select')selectMarker(msg.id);
    else if(msg.type==='user')setUser(msg.lat,msg.lng);
    else if(msg.type==='radius')setRadius(msg.radiusM);
  }catch(e){}
}
document.addEventListener('message',function(e){_handle(e.data);});
window.addEventListener('message',function(e){_handle(e.data);});
</script>
</body>
</html>`;

export function LeafletMap({
  markers,
  selectedId,
  userLat,
  userLng,
  radiusKm,
  onMarkerTap,
}: LeafletMapProps) {
  const webviewRef    = useRef<WebView>(null);
  const loadedRef     = useRef(false);
  const selectedIdRef = useRef(selectedId); // always current, no stale closure

  // Keep ref in sync
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  // Debounce markers — progressive loading fires many rapid updates.
  // Wait 400ms of quiet before pushing to the WebView.
  const debouncedMarkers = useDebounce(markers, 400);

  function inject(js: string) {
    if (!loadedRef.current) return;
    webviewRef.current?.injectJavaScript(js + "; true;");
  }

  // Push markers whenever the debounced value settles, then re-apply selection.
  // setMarkers() resets _sel inside the WebView, so we must call selectMarker
  // again immediately after — otherwise a tap during the debounce window is lost.
  useEffect(() => {
    const data = debouncedMarkers.map((m) => ({
      id: m.id,
      lat: m.lat,
      lng: m.lng,
      title: m.title,
      description: m.description ?? null,
      imageUrl: m.imageUrl ?? null,
    }));
    const sel = selectedIdRef.current;
    // Batch both calls in one inject so they run synchronously in the WebView
    const js = `setMarkers(${JSON.stringify(data)});${sel ? `selectMarker(${JSON.stringify(sel)});` : ""}`;
    inject(js);
  }, [debouncedMarkers]);

  // Push selection changes immediately (user tapped a card or pin)
  useEffect(() => {
    inject(`selectMarker(${JSON.stringify(selectedId)})`);
  }, [selectedId]);

  // Push user location
  useEffect(() => {
    if (userLat != null && userLng != null) {
      inject(`setUser(${userLat},${userLng})`);
    }
  }, [userLat, userLng]);

  // Push search radius — draws a circle and zooms to it before pins arrive
  useEffect(() => {
    if (radiusKm != null) {
      inject(`setRadius(${radiusKm * 1000})`);
    }
  }, [radiusKm]);

  function handleMessage(event: { nativeEvent: { data: string } }) {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === "tap" && onMarkerTap) {
        onMarkerTap(msg.id);
      }
    } catch {}
  }

  function handleLoadEnd() {
    loadedRef.current = true;
    // Push current state into the freshly loaded WebView
    const data = markers.map((m) => ({
      id: m.id,
      lat: m.lat,
      lng: m.lng,
      title: m.title,
      description: m.description ?? null,
      imageUrl: m.imageUrl ?? null,
    }));
    if (data.length > 0) {
      webviewRef.current?.injectJavaScript(`setMarkers(${JSON.stringify(data)}); true;`);
    }
    if (radiusKm != null) {
      webviewRef.current?.injectJavaScript(`setRadius(${radiusKm * 1000}); true;`);
    }
    if (userLat != null && userLng != null) {
      webviewRef.current?.injectJavaScript(`setUser(${userLat},${userLng}); true;`);
    }
    if (selectedId) {
      webviewRef.current?.injectJavaScript(`selectMarker(${JSON.stringify(selectedId)}); true;`);
    }
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ html: MAP_HTML }}
        style={styles.webview}
        onMessage={handleMessage}
        originWhitelist={["*"]}
        javaScriptEnabled
        onLoadEnd={handleLoadEnd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1e293b",
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "#1e293b",
  },
});
