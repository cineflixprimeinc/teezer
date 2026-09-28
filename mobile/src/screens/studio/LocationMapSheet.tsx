import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, MapPin, X } from "lucide-react-native";
import { colors } from "@/constants/colors";
import { font, radius as rad, spacing } from "@/constants/theme";

export type GeoTarget = { lat: number; lng: number; radius_km: number };

const RADIUS_OPTIONS = [1, 5, 10, 25, 50];
const DEFAULT_CENTER = { lat: 27.7172, lng: 85.324 }; // sensible mid-zoom starting point

/**
 * Lightweight map location picker: MapLibre GL JS + free OpenStreetMap raster tiles,
 * rendered inside a WebView (no native map module, no geocoding/search service).
 * The advertiser pans the map (a centre pin marks the target) and picks a radius; we
 * capture only { lat, lng, radius_km }. The map's own geolocate control (WebView
 * geolocation) can recentre on the advertiser.
 */
function mapHtml(lat: number, lng: number, zoom: number, radiusM: number): string {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet"/>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;overflow:hidden}
#pin{position:absolute;top:50%;left:50%;transform:translate(-50%,-100%);z-index:5;pointer-events:none;font-size:38px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.4))}
.maplibregl-ctrl-attrib{font-size:9px}</style>
</head><body>
<div id="map"></div><div id="pin">📍</div>
<script>
var radiusM=${radiusM};
var map=new maplibregl.Map({container:'map',style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]},center:[${lng},${lat}],zoom:${zoom}});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
map.addControl(new maplibregl.GeolocateControl({positionOptions:{enableHighAccuracy:true},trackUserLocation:false}),'bottom-right');
function circle(lng,lat,m){var pts=64,c=[],km=m/1000,dLat=km/110.574,dLng=km/(111.320*Math.cos(lat*Math.PI/180));for(var i=0;i<=pts;i++){var t=2*Math.PI*i/pts;c.push([lng+dLng*Math.cos(t),lat+dLat*Math.sin(t)]);}return{type:'Feature',geometry:{type:'Polygon',coordinates:[c]}};}
function draw(){var c=map.getCenter();var d=circle(c.lng,c.lat,radiusM);var s=map.getSource('circle');if(s){s.setData(d);}else{map.addSource('circle',{type:'geojson',data:d});map.addLayer({id:'cf',type:'fill',source:'circle',paint:{'fill-color':'#fe2c55','fill-opacity':0.12}});map.addLayer({id:'cl',type:'line',source:'circle',paint:{'line-color':'#fe2c55','line-width':2}});}}
function post(){var c=map.getCenter();if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(JSON.stringify({lat:c.lat,lng:c.lng}));}}
window.setRadius=function(m){radiusM=m;draw();post();};
map.on('load',function(){draw();post();});
map.on('move',draw);
map.on('moveend',post);
map.on('click',function(e){map.easeTo({center:e.lngLat});});
</script></body></html>`;
}

export function LocationMapSheet({ visible, onClose, initial, onConfirm }: {
  visible: boolean;
  onClose: () => void;
  initial: GeoTarget | null;
  onConfirm: (g: GeoTarget) => void;
}) {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [center, setCenter] = useState(initial ? { lat: initial.lat, lng: initial.lng } : DEFAULT_CENTER);
  const [radiusKm, setRadiusKm] = useState(initial?.radius_km ?? 5);
  const [custom, setCustom] = useState(!!initial && !RADIUS_OPTIONS.includes(initial.radius_km));
  const [customVal, setCustomVal] = useState(String(initial?.radius_km ?? 10));

  // Rebuild the map only when (re)opened, seeded from the incoming target.
  const html = useMemo(() => {
    const lat = initial?.lat ?? DEFAULT_CENTER.lat;
    const lng = initial?.lng ?? DEFAULT_CENTER.lng;
    return mapHtml(lat, lng, initial ? 11 : 3.4, (initial?.radius_km ?? 5) * 1000);
  }, [visible, initial]);

  useEffect(() => {
    if (visible) {
      setCenter(initial ? { lat: initial.lat, lng: initial.lng } : DEFAULT_CENTER);
      setRadiusKm(initial?.radius_km ?? 5);
      setCustom(!!initial && !RADIUS_OPTIONS.includes(initial.radius_km));
      setCustomVal(String(initial?.radius_km ?? 10));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyRadius = (km: number) => {
    setRadiusKm(km);
    webRef.current?.injectJavaScript(`window.setRadius && window.setRadius(${km * 1000}); true;`);
  };

  const onCustom = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "");
    setCustomVal(digits);
    const km = Math.max(1, Math.min(500, parseInt(digits || "0", 10)));
    if (km >= 1) applyRadius(km);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Top bar */}
        <View style={s.top}>
          <Pressable hitSlop={10} onPress={onClose} style={s.topIcon}>
            <X size={22} color={colors.text} />
          </Pressable>
          <Text style={s.topTitle}>Choose Target Location</Text>
          <View style={{ width: 30 }} />
        </View>

        {/* Map */}
        <View style={s.mapWrap}>
          {visible && (
            <WebView
              ref={webRef}
              source={{ html }}
              originWhitelist={["*"]}
              javaScriptEnabled
              domStorageEnabled
              geolocationEnabled
              onMessage={(e) => {
                try {
                  const d = JSON.parse(e.nativeEvent.data);
                  if (typeof d.lat === "number" && typeof d.lng === "number") setCenter({ lat: d.lat, lng: d.lng });
                } catch { /* ignore */ }
              }}
              style={{ flex: 1, backgroundColor: colors.bgMuted }}
            />
          )}
          <View style={s.coordChip} pointerEvents="none">
            <MapPin size={12} color={colors.brand} strokeWidth={2.6} />
            <Text style={s.coordText}>{center.lat.toFixed(4)}, {center.lng.toFixed(4)}</Text>
          </View>
        </View>

        {/* Controls */}
        <View style={[s.panel, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={s.panelLabel}>Radius</Text>
          <View style={s.chipRow}>
            {RADIUS_OPTIONS.map((km) => {
              const on = !custom && radiusKm === km;
              return (
                <Pressable key={km} style={[s.chip, on && s.chipOn]} onPress={() => { setCustom(false); applyRadius(km); }}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>{km} km</Text>
                </Pressable>
              );
            })}
            <Pressable style={[s.chip, custom && s.chipOn]} onPress={() => { setCustom(true); onCustom(customVal); }}>
              <Text style={[s.chipText, custom && s.chipTextOn]}>Custom</Text>
            </Pressable>
          </View>

          {custom && (
            <View style={s.customRow}>
              <TextInput
                style={s.customInput}
                value={customVal}
                onChangeText={onCustom}
                keyboardType="number-pad"
                placeholder="Radius"
                placeholderTextColor={colors.textFaint}
                maxLength={3}
              />
              <Text style={s.customUnit}>km</Text>
            </View>
          )}

          <Text style={s.hint}>Pan the map to place the pin, then set how far around it to reach.</Text>

          <Pressable style={s.confirm} onPress={() => onConfirm({ lat: center.lat, lng: center.lng, radius_km: radiusKm })}>
            <Check size={17} color={colors.white} strokeWidth={2.8} />
            <Text style={s.confirmText}>Use this location ({radiusKm} km)</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, height: 52 },
  topIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 16, fontWeight: font.weightHeavy, color: colors.text },

  mapWrap: { flex: 1, position: "relative" },
  coordChip: {
    position: "absolute", top: 12, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.card, borderRadius: rad.pill, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  coordText: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.text, fontVariant: ["tabular-nums"] },

  panel: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 10, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  panelLabel: { fontSize: 11, fontWeight: font.weightHeavy, color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, height: 38, borderRadius: rad.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  chipText: { fontSize: 13, fontWeight: font.weightBold, color: colors.textSecondary },
  chipTextOn: { color: colors.brand },

  customRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: rad.md, paddingHorizontal: 14, height: 48, alignSelf: "flex-start", minWidth: 130 },
  customInput: { flex: 1, fontSize: 16, fontWeight: font.weightBold, color: colors.text, padding: 0 },
  customUnit: { fontSize: 14, color: colors.textMuted, fontWeight: font.weightBold },

  hint: { fontSize: 12, color: colors.textFaint, lineHeight: 17 },

  confirm: { marginTop: 4, height: 52, borderRadius: rad.lg, backgroundColor: colors.brand, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  confirmText: { fontSize: 15, fontWeight: font.weightHeavy, color: colors.white },
});
