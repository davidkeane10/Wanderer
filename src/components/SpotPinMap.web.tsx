/**
 * SpotPinMap — web (PWA / browser) implementation via iframe + Leaflet.
 * Tapping the map drops a draggable amber pin and fires onPinDrop.
 */

import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import type { SpotPinMapProps } from "./SpotPinMap.native";

export type { SpotPinMapProps };

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
#map{width:100%;height:100%;cursor:crosshair}
.leaflet-tile-pane{filter:brightness(0.85) saturate(0.9)}
.spot-pin{width:26px;height:26px;background:#f59e0b;border-radius:50% 50% 50% 0;
  transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.6)}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map=L.map('map',{zoomControl:true});
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:''}).addTo(map);
map.setView([20,0],2);
var _pin=null;
var pinIcon=L.divIcon({className:'',html:'<div class="spot-pin"></div>',iconSize:[26,26],iconAnchor:[13,26]});

function _send(data){
  try{window.parent.postMessage(JSON.stringify(data),'*');}catch(e){}
}
function _placePinAt(lat,lng){
  if(_pin)_pin.remove();
  _pin=L.marker([lat,lng],{icon:pinIcon,draggable:true}).addTo(map);
  _pin.on('dragend',function(){
    var p=_pin.getLatLng();
    _send({type:'pinned',lat:p.lat,lng:p.lng});
  });
}
function initMap(lat,lng,zoom,pinLat,pinLng){
  map.setView([lat,lng],zoom||13);
  if(pinLat!=null&&pinLng!=null){_placePinAt(pinLat,pinLng);}
}
map.on('click',function(e){
  _placePinAt(e.latlng.lat,e.latlng.lng);
  _send({type:'pinned',lat:e.latlng.lat,lng:e.latlng.lng});
});
window.addEventListener('message',function(e){
  try{var m=JSON.parse(e.data);if(m.type==='init')initMap(m.lat,m.lng,m.zoom,m.pinLat,m.pinLng);}catch(err){}
});
</script>
</body>
</html>`;

export function SpotPinMap({ initialLat, initialLng, pinLat, pinLng, onPinDrop }: SpotPinMapProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iframeRef = useRef<any>(null);
  const readyRef = useRef(false);

  function sendToMap(msg: object) {
    if (readyRef.current && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(JSON.stringify(msg), "*");
    }
  }

  useEffect(() => {
    function handler(e: MessageEvent) {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "pinned") onPinDrop(msg.lat, msg.lng);
      } catch {}
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onPinDrop]);

  function handleLoad() {
    readyRef.current = true;
    sendToMap({ type: "init", lat: initialLat, lng: initialLng, zoom: 13, pinLat: pinLat ?? null, pinLng: pinLng ?? null });
  }

  useEffect(() => {
    sendToMap({ type: "init", lat: initialLat, lng: initialLng, zoom: 13, pinLat: pinLat ?? null, pinLng: pinLng ?? null });
  }, [initialLat, initialLng]);

  return (
    <View style={styles.container}>
      {/* @ts-ignore */}
      <iframe
        ref={iframeRef}
        srcDoc={MAP_HTML}
        style={iframeStyle}
        onLoad={handleLoad}
        title="Pick spot location"
        sandbox="allow-scripts allow-same-origin"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#1e293b", overflow: "hidden" },
});

const iframeStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  height: "100%",
  border: "none",
  display: "block",
};
