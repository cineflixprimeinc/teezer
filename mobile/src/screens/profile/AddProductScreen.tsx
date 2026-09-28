import { Children, Fragment, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import {
  Boxes,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImagePlus,
  Layers,
  Lock,
  Package,
  Plus,
  Search,
  Sparkles,
  Tag,
  Truck,
  Wallet,
  X,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { ds, radius } from "@/theme/design";
import { shopApi, type NewProductVariation } from "@/api/shop.api";
import type { RootStackParamList } from "@/navigation/types";

const MAX_IMAGES = 8;
const MAX_IMAGE_MB = 20;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const SHIPPING_TYPES = ["Standard Shipping", "Express Shipping", "Free Shipping", "Local Pickup"];

type PickedImage = { uri: string; name: string; type: string };

export function AddProductScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "AddProduct">>();
  const { username } = route.params;
  const qc = useQueryClient();

  const [images, setImages] = useState<PickedImage[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<{ id: number; name: string } | null>(null);
  const [subcategory, setSubcategory] = useState<{ id: number; name: string } | null>(null);
  const [price, setPrice] = useState("");
  const [compareAtPrice, setCompareAtPrice] = useState("");
  const [currency, setCurrency] = useState<string | null>(null);
  const [sku, setSku] = useState("");
  const [description, setDescription] = useState("");
  const [variations, setVariations] = useState<NewProductVariation[]>([]);
  const [stock, setStock] = useState("");
  const [shippingType, setShippingType] = useState<string | null>(null);
  const [isDigital, setIsDigital] = useState(false);
  const [allowCod, setAllowCod] = useState(true);
  const [status, setStatus] = useState<"active" | "draft">("active");
  const [error, setError] = useState<string | null>(null);

  const [shippingPickerOpen, setShippingPickerOpen] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [currencyQuery, setCurrencyQuery] = useState("");

  const categoriesQ = useQuery({ queryKey: ["shop-categories-global"], queryFn: shopApi.categories });
  const currenciesQ = useQuery({ queryKey: ["shop-currencies"], queryFn: shopApi.currencies });
  const detectQ = useQuery({ queryKey: ["shop-detect-currency"], queryFn: shopApi.detectCurrency, staleTime: Infinity, retry: false });

  // Pre-fill from the seller's own detected country the first time - a tap on
  // the currency pill still overrides it freely, this only saves them from
  // hunting their own currency out of a 46-entry list on every product.
  useEffect(() => {
    if (detectQ.data && currency == null) setCurrency(detectQ.data.currency);
  }, [detectQ.data, currency]);

  const subcategories = useMemo(
    () => (categoriesQ.data ?? []).filter((c) => c.parent_id === category?.id),
    [categoriesQ.data, category],
  );

  // ShopCategoryPickerScreen's return value - same nav-param pattern
  // EditShopScreen uses for its own category pick, see that screen's comment.
  const pickedCategoryId = route.params?.pickedCategoryId;
  useEffect(() => {
    if (pickedCategoryId == null) return;
    setCategory({ id: pickedCategoryId, name: route.params?.pickedCategoryName ?? "" });
    setSubcategory(null);
    navigation.setParams({ pickedCategoryId: undefined, pickedCategoryName: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedCategoryId]);

  const pickedSubcategoryId = route.params?.pickedSubcategoryId;
  useEffect(() => {
    if (pickedSubcategoryId == null) return;
    setSubcategory({ id: pickedSubcategoryId, name: route.params?.pickedSubcategoryName ?? "" });
    navigation.setParams({ pickedSubcategoryId: undefined, pickedSubcategoryName: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedSubcategoryId]);

  // AddVariationScreen's return value - same picked*-param round-trip as
  // category/subcategory above.
  const newVariationName = route.params?.newVariationName;
  useEffect(() => {
    if (!newVariationName) return;
    setVariations((prev) => [...prev, { name: newVariationName, options: route.params?.newVariationOptions ?? [] }]);
    navigation.setParams({ newVariationName: undefined, newVariationOptions: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newVariationName]);

  const canSubmit =
    !!name.trim() && !!description.trim() && !!category && !!price.trim() && !!stock.trim();

  const create = useMutation({
    mutationFn: (asDraft: boolean) =>
      shopApi.createProduct({
        name: name.trim(),
        description: description.trim(),
        category_id: category!.id,
        subcategory_id: subcategory?.id ?? null,
        price: Number(price),
        currency: currency ?? undefined,
        compare_at_price: compareAtPrice ? Number(compareAtPrice) : null,
        sku: sku.trim() || null,
        stock: Number(stock),
        shipping_type: shippingType,
        is_digital: isDigital,
        allow_cod: allowCod,
        is_active: asDraft ? false : true,
        variations,
        images,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop-products", username] });
      qc.invalidateQueries({ queryKey: ["shop", username] });
      navigation.goBack();
    },
    onError: (e: any) => setError(e?.response?.data?.message || "Couldn't publish this product. Try again."),
  });

  const pickImages = async () => {
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Photo access needed", "Allow photo library access to add product images.");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], // photos only - no videos, no live photos
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    });
    if (res.canceled) return;

    // fileSize is only reliably populated for a real on-disk asset (which a
    // gallery pick always is), so this doesn't false-reject anything - a
    // missing fileSize just skips the check rather than blocking the photo.
    const tooLarge = res.assets.filter((a) => (a.fileSize ?? 0) > MAX_IMAGE_BYTES);
    const usable = res.assets.filter((a) => (a.fileSize ?? 0) <= MAX_IMAGE_BYTES);
    if (tooLarge.length) {
      Alert.alert(
        tooLarge.length === 1 ? "Photo too large" : "Some photos too large",
        `${tooLarge.length} photo${tooLarge.length > 1 ? "s are" : " is"} over the ${MAX_IMAGE_MB}MB limit and won't be added.`,
      );
    }

    setImages((prev) => [
      ...prev,
      ...usable.map((a, i) => ({
        uri: a.uri,
        name: a.fileName ?? `product-${Date.now()}-${i}.jpg`,
        type: a.mimeType ?? "image/jpeg",
      })),
    ].slice(0, MAX_IMAGES));
  };

  const removeImage = (uri: string) => setImages((prev) => prev.filter((i) => i.uri !== uri));

  const filteredCurrencies = useMemo(() => {
    const q = currencyQuery.trim().toLowerCase();
    const list = currenciesQ.data ?? [];
    if (!q) return list;
    return list.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [currenciesQ.data, currencyQuery]);

  return (
    <Screen bg={ds.bg}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <ChevronLeft size={22} color={ds.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Add New Product</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* ── Images ─────────────────────────────────────────────────── */}
        <Section icon={ImagePlus} title="Product Photos" hint={`Add up to 8, max ${MAX_IMAGE_MB}MB each - the first is the cover shown on your storefront`}>
          <View style={styles.imageGrid}>
            {images.map((img, i) => (
              <View key={img.uri} style={styles.imageCell}>
                <Image source={{ uri: img.uri }} style={styles.imageThumb} />
                {i === 0 && (
                  <View style={styles.coverBadge}>
                    <Text style={styles.coverBadgeText}>Cover</Text>
                  </View>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" style={styles.imageRemove} onPress={() => removeImage(img.uri)}>
                  <X size={12} color={ds.onDark} />
                </Pressable>
              </View>
            ))}
            {images.length === 0 && (
              <Pressable accessibilityRole="button" style={styles.imageCellAdd} onPress={pickImages}>
                <ImagePlus size={20} color={ds.accent} />
                <Text style={styles.imageCellAddText}>Add Photos</Text>
              </Pressable>
            )}
            {images.length > 0 && images.length < MAX_IMAGES && (
              <Pressable accessibilityRole="button" style={styles.imageCellPlus} onPress={pickImages}>
                <Plus size={18} color={ds.textMuted} />
              </Pressable>
            )}
            {Array.from({ length: Math.max(0, MAX_IMAGES - images.length - (images.length < MAX_IMAGES ? 1 : 0)) }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.imageCellEmpty}>
                <Plus size={18} color={ds.textFaint} />
              </View>
            ))}
          </View>
        </Section>

        {/* ── Basics ─────────────────────────────────────────────────── */}
        <Section icon={FileText} title="Basics">
          <Field label="Product Name" required>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Premium Cotton Shirt" placeholderTextColor={ds.textFaint} />
          </Field>

          <Field label="Category" required>
            <NavRow
              icon={Tag}
              value={category?.name ?? null}
              placeholder="Select a category"
              onPress={() => navigation.navigate("ShopCategoryPicker", { selectedId: category?.id ?? null, returnTo: "AddProduct" })}
            />
          </Field>

          {!!subcategories.length && (
            <Field label="Subcategory" hint="(Optional)">
              <NavRow
                icon={Layers}
                value={subcategory?.name ?? null}
                placeholder="Select a subcategory"
                onPress={() =>
                  navigation.navigate("ShopCategoryPicker", {
                    selectedId: subcategory?.id ?? null,
                    returnTo: "AddProduct",
                    forSubcategory: true,
                    parentId: category!.id,
                    parentName: category!.name,
                  })
                }
              />
            </Field>
          )}

          <Field label="Product Description" required>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={description}
              onChangeText={(t) => setDescription(t.slice(0, 1000))}
              placeholder="Describe your product, features, material, size info, etc."
              placeholderTextColor={ds.textFaint}
              multiline
              maxLength={1000}
            />
            <Text style={styles.charCount}>{description.length}/1000</Text>
          </Field>
        </Section>

        {/* ── Pricing ────────────────────────────────────────────────── */}
        <Section icon={Wallet} title="Pricing" hint="Currency is set from your country - tap it to change">
          <Field label="Price" required>
            <View style={styles.priceRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Change currency"
                style={styles.currencyPill}
                onPress={() => setCurrencyPickerOpen(true)}
              >
                <Text style={styles.currencyPillText}>{currency ?? "…"}</Text>
                <ChevronRight size={13} color={ds.textMuted} style={{ transform: [{ rotate: "90deg" }] }} />
              </Pressable>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={price}
                onChangeText={setPrice}
                placeholder="Enter price"
                placeholderTextColor={ds.textFaint}
                keyboardType="numeric"
              />
            </View>
          </Field>

          <Field label="Compare at Price" hint="(Optional) - shown crossed out, for a discount">
            <View style={styles.priceRow}>
              <View style={[styles.currencyPill, styles.currencyPillStatic]}>
                <Text style={styles.currencyPillText}>{currency ?? "…"}</Text>
              </View>
              <TextInput
                style={[styles.input, styles.priceInput]}
                value={compareAtPrice}
                onChangeText={setCompareAtPrice}
                placeholder="Enter compare at price"
                placeholderTextColor={ds.textFaint}
                keyboardType="numeric"
              />
            </View>
          </Field>

          <Field label="SKU" hint="(Optional)">
            <TextInput style={styles.input} value={sku} onChangeText={setSku} placeholder="Enter SKU" placeholderTextColor={ds.textFaint} />
          </Field>
        </Section>

        {/* ── Inventory & variations ────────────────────────────────── */}
        <Section icon={Boxes} title="Inventory">
          <Field label="Stock" required>
            <TextInput style={styles.input} value={stock} onChangeText={setStock} placeholder="Enter available stock" placeholderTextColor={ds.textFaint} keyboardType="numeric" />
          </Field>

          <View style={styles.field}>
            <Text style={styles.label}>Variations</Text>
            <Text style={styles.fieldHint}>Add size, color or other options</Text>
            {variations.map((v, i) => (
              <View key={i} style={styles.variationRow}>
                <Text style={styles.variationText}>
                  <Text style={{ fontWeight: "700" }}>{v.name}:</Text> {v.options.join(", ")}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove variation" onPress={() => setVariations((prev) => prev.filter((_, j) => j !== i))}>
                  <X size={15} color={ds.textMuted} />
                </Pressable>
              </View>
            ))}
            <Pressable accessibilityRole="button" style={styles.addVariationBtn} onPress={() => navigation.navigate("AddVariation", { username })}>
              <Plus size={15} color={ds.accent} />
              <Text style={styles.addVariationText}>Add Variation</Text>
            </Pressable>
          </View>
        </Section>

        {/* ── Shipping & fulfillment ─────────────────────────────────── */}
        <Section icon={Truck} title="Shipping & Fulfillment">
          <Field label="Shipping">
            <NavRow icon={Package} value={shippingType} placeholder="Select shipping type" onPress={() => setShippingPickerOpen(true)} />
          </Field>

          <ToggleRow title="Digital Product" subtitle="This is a digital product" value={isDigital} onChange={setIsDigital} />
          <ToggleRow title="Allow Cash on Delivery" subtitle="Customers can pay on delivery" value={allowCod} onChange={setAllowCod} />
        </Section>

        {/* ── Publish ────────────────────────────────────────────────── */}
        <Section icon={Sparkles} title="Publish">
          <View style={styles.statusRow}>
            <Pressable
              accessibilityRole="button"
              style={[styles.statusBtn, status === "active" && styles.statusBtnActive]}
              onPress={() => setStatus("active")}
            >
              <Text style={[styles.statusBtnText, status === "active" && styles.statusBtnTextActive]}>Active</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.statusBtn, status === "draft" && styles.statusBtnDraft]}
              onPress={() => setStatus("draft")}
            >
              <Lock size={12} color={status === "draft" ? ds.text : ds.textMuted} />
              <Text style={styles.statusBtnText}>Draft</Text>
            </Pressable>
          </View>
          {status === "draft" && (
            <View style={styles.draftNoteRow}>
              <Lock size={12} color={ds.textMuted} />
              <Text style={styles.draftNote}>
                Private - only you can see a draft. It won&apos;t show on your storefront until you switch it to Active.
              </Text>
            </View>
          )}
        </Section>

        <View style={styles.ctaArea}>
          {!!error && <Text style={styles.error}>{error}</Text>}

          {/* One button, driven by the Active/Draft choice above - the old
             screen had this AND two separate Publish/Save-as-Draft buttons
             underneath that ignored it entirely (always Active no matter
             what was selected), so the toggle never actually did anything. */}
          <Pressable
            accessibilityRole="button"
            disabled={!canSubmit || create.isPending}
            style={[styles.publishBtn, (!canSubmit || create.isPending) && styles.btnDisabled]}
            onPress={() => create.mutate(status === "draft")}
          >
            {create.isPending ? (
              <ActivityIndicator color={ds.onDark} />
            ) : (
              <Text style={styles.publishBtnText}>{status === "draft" ? "Save as Draft" : "Publish Product"}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>

      <BottomSheet visible={shippingPickerOpen} onClose={() => setShippingPickerOpen(false)} height="auto">
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Select shipping type</Text>
          {SHIPPING_TYPES.map((s) => (
            <Pressable key={s} accessibilityRole="button" style={styles.sheetRow} onPress={() => { setShippingType(s); setShippingPickerOpen(false); }}>
              <Text style={styles.sheetRowText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={currencyPickerOpen}
        onClose={() => { setCurrencyPickerOpen(false); setCurrencyQuery(""); }}
        height={0.7}
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Select currency</Text>
          <View style={styles.currencySearchBox}>
            <Search size={16} color={ds.textFaint} />
            <TextInput
              value={currencyQuery}
              onChangeText={setCurrencyQuery}
              placeholder="Search currencies"
              placeholderTextColor={ds.textFaint}
              style={styles.currencySearchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!currencyQuery && (
              <Pressable hitSlop={8} onPress={() => setCurrencyQuery("")}>
                <X size={15} color={ds.textFaint} />
              </Pressable>
            )}
          </View>
          {filteredCurrencies.map((c) => (
            <Pressable
              key={c.code}
              accessibilityRole="button"
              style={styles.sheetRow}
              onPress={() => { setCurrency(c.code); setCurrencyPickerOpen(false); setCurrencyQuery(""); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetRowText}>{c.code} · {c.name}</Text>
              </View>
              <Text style={styles.currencySymbol}>{c.symbol}</Text>
              {c.code === currency && <Check size={17} color={ds.accent} strokeWidth={2.6} style={{ marginLeft: 8 }} />}
            </Pressable>
          ))}
          {!filteredCurrencies.length && <Text style={styles.sheetRowText}>No currencies match &quot;{currencyQuery}&quot;.</Text>}
        </View>
      </BottomSheet>
    </Screen>
  );
}

/* ── small pieces ─────────────────────────────────────────────────────── */

function Section({
  icon: Icon, title, hint, children,
}: { icon: React.ComponentType<{ size?: number; color?: string }>; title: string; hint?: string; children: React.ReactNode }) {
  // Every field/row/toggle inside a section used to sit directly against the
  // next with no line between them - fine at a glance, but on a real screen
  // with several stacked rows (Category right above Subcategory, one toggle
  // right above the next) it reads as one smeared block instead of separate
  // controls. A hairline divider between each direct child fixes that
  // without touching every call site - conditional rows (Subcategory only
  // renders once there's a category) still divide correctly since this
  // runs on the resolved children, not a fixed count.
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIconBadge}>
          <Icon size={15} color={ds.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
        </View>
      </View>
      <View style={styles.sectionCard}>
        {items.map((child, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={styles.fieldDivider} />}
            {child}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label} {required && <Text style={styles.required}>*</Text>}
        {!!hint && <Text style={styles.fieldHintInline}> {hint}</Text>}
      </Text>
      {children}
    </View>
  );
}

function NavRow({
  icon: Icon, value, placeholder, onPress,
}: { icon?: React.ComponentType<{ size?: number; color?: string }>; value: string | null; placeholder: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" style={styles.navRow} onPress={onPress}>
      <View style={styles.navRowLeft}>
        {!!Icon && <Icon size={16} color={value ? ds.accent : ds.textFaint} />}
        <Text style={value ? styles.navRowValue : styles.navRowPlaceholder}>{value ?? placeholder}</Text>
      </View>
      <ChevronRight size={17} color={ds.textFaint} />
    </Pressable>
  );
}

function ToggleRow({ title, subtitle, value, onChange }: { title: string; subtitle: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: ds.accent, false: ds.line }} thumbColor={ds.onDark} ios_backgroundColor={ds.line} />
    </View>
  );
}

/* ── styles ───────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ds.line, backgroundColor: ds.surface },
  headerBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: ds.text },

  section: { marginTop: 26, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  sectionIconBadge: { width: 28, height: 28, borderRadius: 9, backgroundColor: ds.accentWash, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 14.5, fontWeight: "800", color: ds.text },
  sectionHint: { fontSize: 11.5, color: ds.textMuted, marginTop: 1 },
  sectionCard: {
    backgroundColor: ds.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: ds.lineSoft,
    paddingHorizontal: 14, paddingVertical: 6,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  // Bleeds to the card's edges (cancels sectionCard's own horizontal padding)
  // so it reads as one continuous line under the full row, not a short dash
  // floating between two fields' text.
  fieldDivider: { height: StyleSheet.hairlineWidth, backgroundColor: ds.lineSoft, marginHorizontal: -14 },

  field: { paddingVertical: 16 },
  label: { fontSize: 13, fontWeight: "700", color: ds.text, marginBottom: 9 },
  required: { color: ds.accent },
  fieldHint: { fontSize: 12, color: ds.textMuted, marginTop: -4, marginBottom: 8 },
  fieldHintInline: { fontSize: 12, color: ds.textMuted, fontWeight: "400" },

  input: { borderWidth: 1, borderColor: ds.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: ds.text, backgroundColor: ds.surfaceMuted },
  textarea: { minHeight: 90, textAlignVertical: "top" },
  charCount: { alignSelf: "flex-end", fontSize: 11, color: ds.textFaint, marginTop: 4 },

  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  imageCellAdd: { width: "22%", aspectRatio: 1, borderRadius: radius.md, borderWidth: 1.5, borderColor: ds.accent, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4, padding: 4 },
  imageCellAddText: { fontSize: 10, color: ds.accent, fontWeight: "700", textAlign: "center" },
  imageCellPlus: { width: "22%", aspectRatio: 1, borderRadius: radius.md, borderWidth: 1, borderColor: ds.line, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  imageCellEmpty: { width: "22%", aspectRatio: 1, borderRadius: radius.md, borderWidth: 1, borderColor: ds.lineSoft, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  imageCell: { width: "22%", aspectRatio: 1, borderRadius: radius.md, overflow: "hidden" },
  imageThumb: { width: "100%", height: "100%" },
  imageRemove: { position: "absolute", top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" },
  coverBadge: { position: "absolute", bottom: 4, left: 4, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  coverBadgeText: { fontSize: 8.5, fontWeight: "800", color: ds.onDark },

  priceRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  currencyPill: { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderColor: ds.line, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: ds.surfaceMuted },
  currencyPillStatic: { opacity: 0.7 },
  currencyPillText: { fontSize: 14, color: ds.text, fontWeight: "700" },
  priceInput: { flex: 1 },

  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: ds.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: ds.surfaceMuted },
  navRowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  navRowValue: { fontSize: 14, color: ds.text },
  navRowPlaceholder: { fontSize: 14, color: ds.textFaint },

  variationRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: ds.lineSoft },
  variationText: { fontSize: 13, color: ds.textDim, flex: 1 },
  addVariationBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: ds.accentWash, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, alignSelf: "flex-start", marginTop: 10, marginBottom: 10 },
  addVariationText: { fontSize: 13, color: ds.accent, fontWeight: "700" },

  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  toggleTitle: { fontSize: 14, fontWeight: "700", color: ds.text },
  toggleSubtitle: { fontSize: 12, color: ds.textMuted, marginTop: 2 },

  statusRow: { flexDirection: "row", gap: 10, paddingVertical: 14 },
  statusBtn: { flex: 1, flexDirection: "row", gap: 6, borderWidth: 1, borderColor: ds.line, borderRadius: radius.md, paddingVertical: 13, alignItems: "center", justifyContent: "center" },
  statusBtnActive: { borderColor: ds.accent, backgroundColor: ds.accentWash },
  statusBtnDraft: { borderColor: ds.lineStrong, backgroundColor: ds.surfaceMuted },
  statusBtnText: { fontSize: 14, fontWeight: "700", color: ds.text },
  statusBtnTextActive: { color: ds.accent },
  draftNoteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingBottom: 14 },
  draftNote: { flex: 1, fontSize: 12, color: ds.textMuted, lineHeight: 17 },

  ctaArea: { paddingHorizontal: 16, marginTop: 18 },
  error: { fontSize: 12.5, color: "#dc2626", fontWeight: "600", marginBottom: 8 },

  publishBtn: { backgroundColor: ds.accent, borderRadius: radius.pill, height: 52, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  publishBtnText: { color: ds.onDark, fontWeight: "800", fontSize: 15.5 },
  btnDisabled: { opacity: 0.5 },

  // BottomSheet itself adds no horizontal padding at all (by design - some
  // callers want edge-to-edge content), so every sheet's content here is
  // wrapped in this rather than sitting flush against the screen edges.
  sheetContent: { paddingHorizontal: 16, paddingBottom: 4 },
  sheetTitle: { fontSize: 15, fontWeight: "800", color: ds.text, marginBottom: 10 },
  sheetRow: { flexDirection: "row", alignItems: "center", paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: ds.lineSoft },
  sheetRowText: { fontSize: 14.5, color: ds.text },

  currencySearchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: ds.surfaceMuted, borderRadius: radius.md, paddingHorizontal: 12, height: 42, marginBottom: 8,
  },
  currencySearchInput: { flex: 1, fontSize: 14, color: ds.text, padding: 0 },
  currencySymbol: { fontSize: 13, color: ds.textMuted, fontWeight: "600", marginLeft: 8 },
});
