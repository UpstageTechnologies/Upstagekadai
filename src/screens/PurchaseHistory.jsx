import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput
} from "react-native";
import { useIsFocused } from "@react-navigation/native"; 

import { auth, db } from "../utils/firebaseConfig";
import {
  collection,
  onSnapshot,
  doc,
  getDoc
} from "firebase/firestore";

import RNFS from "react-native-fs";
import RNPrint from "react-native-print";
import { useContext } from "react";
import { ThemeContext } from "../theme/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function PurchaseHistory({ appMode }) {
  const { theme, darkMode } = useContext(ThemeContext);
  const isFocused = useIsFocused();

  const [items, setItems] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [showBill, setShowBill] = useState(false);
  const [searchText, setSearchText] = useState("");
  const PAGE_SIZE = 3;
  const [currentPage, setCurrentPage] = useState(1);
  const [shopName, setShopName] = useState("MY SHOP");
  const [shopLogo, setShopLogo] = useState("");
  const [purchaseView, setPurchaseView] = useState("Total Purchase");
  const [monthView, setMonthView] = useState("This Month");
  const [currentMode, setCurrentMode] = useState("local");

  useEffect(() => {
    let unsubscribe;

    const loadPurchases = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const targetMode = appMode || "local";
      setCurrentMode(targetMode);

      const collectionName = targetMode === "global" ? "global_invoices" : "invoices";

      if (unsubscribe) unsubscribe();

      unsubscribe = onSnapshot(
        collection(db, "users", user.uid, collectionName),
        (snapshot) => {
          let rows = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
          }));

          rows.sort(
            (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
          );

          const finalRows = rows.map((r, index) => ({
            ...r,
            autoBillNo: index + 1
          }));

          setItems(finalRows);
        }
      );
    };

    if (isFocused) {
      loadPurchases();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isFocused, appMode]); 

  useEffect(() => {
    const loadShop = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const logo = await AsyncStorage.getItem(`shopLogo_${user.uid}`);
      const snap = await getDoc(doc(db, "users", user.uid));

      if (snap.exists()) {
        setShopName(snap.data().shopName || "MY SHOP");
      }

      if (logo) {
        setShopLogo(logo);
      }
    };

    loadShop();
  }, []);

const reprintBill = async () => {
    if (!selectedBill || !selectedBill.items) return;

    const purchaseTotal = selectedBill.items.reduce(
      (sum, i) => sum + (i.purchasePrice || i.price || 0) * i.qty,
      0
    );

    // 🌟 பிக்ஸ்: 'tax' வேரியபிள் விடுபட்டதால் வந்த எர்ரர் இங்கு சரிசெய்யப்பட்டுள்ளது
    const tax = (purchaseTotal * 5 / 100).toFixed(2); 

    const purchaseNo = selectedBill.autoBillNo || selectedBill.billNo || selectedBill.invoiceId || "PUR-0000";
    
    const purchaseDate = selectedBill.createdAt?.seconds
      ? new Date(selectedBill.createdAt.seconds * 1000).toLocaleDateString("en-GB")
      : new Date().toLocaleDateString("en-GB");

    let logoHtml = "";
    try {
      if (shopLogo) {
        const base64 = await RNFS.readFile(
          shopLogo.replace("file://", ""),
          "base64"
        );

        logoHtml = `
          <img
            src="data:image/png;base64,${base64}"
            width="70"
            height="70"
            style="
              border-radius:10px;
              margin-right:15px;
              object-fit:cover;
            "
          />
        `;
      }
    } catch (err) {
      console.log("Logo Error:", err);
    }

const html = `
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes">
      <style>
        @page { size: 58mm auto; margin: 0mm; }
        body { font-family: monospace; margin: 0; padding: 6mm 4mm; font-size: 12px; color: #000; font-weight: bold; }
        .center { text-align: center; } 
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; }
        td { font-size: 12px; padding: 2px 0; }
        .right { text-align: right; }
      </style>
    </head>
    <body>
      <div class="center" style="font-size:14px; font-weight:bold; text-transform: uppercase;">${shopName}</div>
      <div class="center">Stock Purchase Entry (${currentMode.toUpperCase()})</div>
      <div class="divider"></div>
      <div>Purchase No: ${purchaseNo}</div>
      <div>Date: ${purchaseDate}</div>
      <div style="margin-top: 2px;">Supplier: ${selectedBill?.supplierName || "-"}</div>
      <div class="divider"></div>
      <table>
        ${selectedBill.items.map(i => `
          <tr>
            <td>${i.itemName || i.name}<br/>&nbsp;&nbsp;${i.qty} x ₹${Number(i.purchasePrice || i.price || 0).toFixed(2)}</td>
            <td class="right" style="vertical-align:bottom;">₹${(i.qty * Number(i.purchasePrice || i.price || 0)).toFixed(2)}</td>
          </tr>
        `).join("")}
      </table>
      <div class="divider"></div>
      <div class="row"><span>Subtotal:</span><span>₹${purchaseTotal.toFixed(2)}</span></div>
      <div class="row"><span>Tax (5%):</span><span>₹${tax}</span></div>
      <div class="row" style="font-size:13px; font-weight:bold; border-top: 1px dashed #000; padding-top: 6px; margin-top: 4px;">
        <span>Grand Total:</span><span>₹${Number(selectedBill?.total || (purchaseTotal + Number(tax))).toFixed(2)}</span>
      </div>
      <div class="divider"></div>
      <div class="center" style="margin-top:12px; font-style: italic;">Stock Entry Confirmed</div>
    </body>
    </html>`;

    await RNPrint.print({ html });
  };
  const totalPurchase = items.reduce((sum, item) => sum + Number(item.total || 0), 0);

  const monthlyPurchase = items
    .filter(item => {
      if (!item.createdAt?.seconds) return false;
      const d = new Date(item.createdAt.seconds * 1000);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, item) => sum + Number(item.total || 0), 0);

  const todayPurchase = items
    .filter(item => {
      if (!item.createdAt?.seconds) return false;
      const d = new Date(item.createdAt.seconds * 1000);
      const now = new Date();
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, item) => sum + Number(item.total || 0), 0);

  const lastMonthPurchase = items
    .filter(item => {
      if (!item.createdAt?.seconds) return false;
      const d = new Date(item.createdAt.seconds * 1000);
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
    })
    .reduce((sum, item) => sum + Number(item.total || 0), 0);

  const purchaseAmount = purchaseView === "Today Purchase" ? todayPurchase : totalPurchase;

  const filteredItems = items.filter(item => {
    const billNo = String(item.billNo || item.invoiceId || item.autoBillNo).toLowerCase();
    const dateText = item.createdAt?.seconds
      ? new Date(item.createdAt.seconds * 1000).toLocaleDateString().toLowerCase()
      : "";
    const totalText = String(item.total || "").toLowerCase();
    const q = searchText.toLowerCase();

    return billNo.includes(q) || dateText.includes(q) || totalText.includes(q);
  });

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE);
  const paginatedItems = filteredItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <View style={{ 
  flex: 1, 
  backgroundColor: theme.background, 
  paddingHorizontal: 16,
  paddingBottom: 60,  // <-- Intha space pagination-kku keela correct-aa irrukkum
  paddingTop: Platform.OS === 'android' ? 2 : 6  // <-- Mela irrukkura extra space-ah remove pannum
}}>
      <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 15, color: theme.text }}>
        Invoice History ({currentMode === "global" ? "Global" : "Local"})
      </Text>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
        <View style={{ flex: 1, backgroundColor: "#22c55e", padding: 12, borderRadius: 16 }}>
          <TouchableOpacity onPress={() => setPurchaseView(purchaseView === "Total Purchase" ? "Today Purchase" : "Total Purchase")}>
            <Text style={{ color: "#fff", fontSize: 13 }}>{purchaseView} ▼</Text>
          </TouchableOpacity>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold", marginTop: 5 }}>
            ₹ {purchaseAmount.toFixed(2)}
          </Text>
        </View>

        <View style={{ flex: 1, backgroundColor: "#2563eb", padding: 12, borderRadius: 16 }}>
          <TouchableOpacity onPress={() => setMonthView(monthView === "This Month" ? "Last Month" : "This Month")}>
            <Text style={{ color: "#fff", fontSize: 13 }}>{monthView} ▼</Text>
          </TouchableOpacity>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold", marginTop: 5 }}>
            ₹ {(monthView === "Last Month" ? lastMonthPurchase : monthlyPurchase).toFixed(2)}
          </Text>
        </View>
      </View>

      <TextInput
        placeholder="Search Bill No, Date, Amount..."
        placeholderTextColor="#64748b"
        value={searchText}
        onChangeText={(t) => {
          setSearchText(t);
          setCurrentPage(1);
        }}
        style={{
          backgroundColor: theme.card,
          height: 40,
          borderRadius: 15,
          paddingHorizontal: 16,
          marginBottom: 15,
          borderWidth: 1,
          borderColor: theme.border,
          color: theme.text
        }}
      />

      <View style={{ height: 395 }}>
        <FlatList
          data={paginatedItems}
          keyExtractor={item => item.billNo || item.id}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true}
          contentContainerStyle={{ paddingBottom: 55, paddingHorizontal: 2 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => {
                setSelectedBill(item);
                setShowBill(true);
              }}
              style={{
                backgroundColor: theme.card,
                padding: 12,
                borderRadius: 18,
                marginBottom: 10,
                shadowColor: "#000",
                shadowOpacity: .08,
                shadowRadius: 8,
                elevation: 4
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>
                Bill No: {item.autoBillNo}
              </Text>

              <Text style={{ marginTop: 8, fontSize: 17, fontWeight: "bold", color: "#16a34a" }}>
                Total ₹ {Number(item.total || 0).toFixed(2)}
              </Text>

              <Text style={{ marginTop: 5, color: "#64748b" }}>
                Date: {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : "-"}
              </Text>

              <Text style={{ marginTop: 5, color: "#6366f1", fontWeight: "600" }}>
                Supplier: {item.supplierName || "-"}
              </Text>

              <Text style={{ marginTop: 10, color: "#6366f1", fontWeight: "600" }}>
                Tap to View Full Bill →
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* PAGINATION */}
      <View style={{
        position: "absolute",
        bottom: 130,
        left: 20,
        right: 20,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: theme.card,
        paddingVertical: 12,
        borderRadius: 16,
        shadowColor: "#000",
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 6
      }}>
        <TouchableOpacity
          disabled={currentPage === 1}
          onPress={() => setCurrentPage(p => Math.max(p - 1, 1))}
          style={{
            backgroundColor: currentPage === 1 ? "#cbd5e1" : "#2563eb",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
            marginRight: 8
          }}
        >
          <Text style={{ color: "#fff" }}>Prev</Text>
        </TouchableOpacity>

        {Array.from(
          { length: Math.min(3, totalPages - (Math.floor((currentPage - 1) / 3) * 3)) },
          (_, i) => (Math.floor((currentPage - 1) / 3) * 3) + i + 1
        ).map(page => (
          <TouchableOpacity
            key={page}
            onPress={() => setCurrentPage(page)}
            style={{
              backgroundColor: currentPage === page ? "#16a34a" : "#e2e8f0",
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 10,
              marginHorizontal: 4
            }}
          >
            <Text style={{ fontWeight: "700", color: currentPage === page ? "#fff" : "#111827" }}>
              {page}
            </Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          disabled={currentPage === totalPages}
          onPress={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
          style={{
            backgroundColor: currentPage === totalPages ? "#cbd5e1" : "#2563eb",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
            marginLeft: 8
          }}
        >
          <Text style={{ color: "#fff" }}>Next</Text>
        </TouchableOpacity>
      </View>

      {/* PROFESSIONAL BILL POPUP MODAL */}
      <Modal
        visible={showBill}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBill(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: "rgba(15, 23, 42, 0.75)", 
          justifyContent: "center",
          padding: 20
        }}>
          <View style={{ 
            backgroundColor: theme.card, 
            borderRadius: 24, 
            padding: 24, 
            maxHeight: "85%", 
            shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20, elevation: 10
          }} >
            
            <Text style={{ fontSize: 20, fontWeight: "800", textAlign: "center", color: theme.text, letterSpacing: 0.5 }}>
              Bill Details
            </Text>
            
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <View style={{ backgroundColor: darkMode ? "#1e293b" : "#f1f5f9", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: darkMode ? "#94a3b8" : "#475569" }}>
                  ID: {selectedBill?.billNo || selectedBill?.invoiceId || "-"}
                </Text>
              </View>
              <View style={{ backgroundColor: "rgba(99, 102, 241, 0.15)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#6366f1" }}>
                  Supplier: {selectedBill?.supplierName || "-"}
                </Text>
              </View>
            </View>

            <View style={{ 
              flexDirection: "row", 
              justifyContent: "space-between", 
              marginTop: 24, 
              paddingBottom: 8, 
              borderBottomWidth: 1.5, 
              borderBottomColor: theme.border 
            }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748b", flex: 2 }}>ITEMS</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748b", flex: 1, textAlign: "center" }}>QTY</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748b", flex: 1, textAlign: "right" }}>PRICE</Text>
            </View>

            <ScrollView style={{ marginTop: 5 }} showsVerticalScrollIndicator={false}>
              {selectedBill?.items?.map((i, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border === "transparent" ? "#f1f5f9" : theme.border
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "500", color: theme.text, flex: 2 }} numberOfLines={2}>
                    {i.itemName || i.name}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: theme.text, flex: 1, textAlign: "center" }}>
                    {i.qty} {i.unitType || "Qty"}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text, flex: 1, textAlign: "right" }}>
                    ₹{Number((Number(i.purchasePrice ?? i.price ?? 0) * Number(i.qty ?? 0))).toFixed(2)}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={{ 
              marginTop: 15, 
              paddingTop: 15, 
              borderTopWidth: 2, 
              borderTopColor: theme.border,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>Grand Total</Text>
              <Text style={{ fontSize: 22, fontWeight: "900", color: "#16a34a" }}>
                ₹ {selectedBill?.total}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
              <TouchableOpacity
                onPress={() => setShowBill(false)}
                style={{ 
                  flex: 1, 
                  backgroundColor: darkMode ? "#334155" : "#e2e8f0", 
                  paddingVertical: 14, 
                  borderRadius: 14,
                  alignItems: "center" 
                }}
              >
                <Text style={{ color: darkMode ? "#cbd5e1" : "#334155", fontWeight: "700", fontSize: 15 }}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={reprintBill}
                style={{ 
                  flex: 1.3, 
                  backgroundColor: "#2563eb", 
                  paddingVertical: 14, 
                  borderRadius: 14,
                  alignItems: "center",
                  shadowColor: "#2563eb",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 6,
                  elevation: 3
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Reprint Bill</Text>
              </TouchableOpacity>
            </View>

          </View>
        </View>
      </Modal>
    </View>
  );
}