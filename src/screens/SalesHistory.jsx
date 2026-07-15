import React, { useEffect, useState, useContext } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  StyleSheet
} from "react-native";
import { useIsFocused } from "@react-navigation/native";

import { auth, db } from "../firebaseConfig";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";

import AsyncStorage from "@react-native-async-storage/async-storage";
import RNFS from "react-native-fs";
import RNPrint from "react-native-print";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { getSession } from "../../utils/session";
import { ThemeContext } from "../theme/ThemeContext";

export default function SalesHistory({ appMode }) {
  const { theme, darkMode } = useContext(ThemeContext);
  const isFocused = useIsFocused();
  

  const [sales, setSales] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [showBill, setShowBill] = useState(false);
  const [search, setSearch] = useState("");
  const PAGE_SIZE = 3;
  const [currentPage, setCurrentPage] = useState(1);
  const [shopName, setShopName] = useState("MY SHOP");
  const [shopLogo, setShopLogo] = useState("");
  
  const [salesView, setSalesView] = useState("Total Sales");     
  const [profitView, setProfitView] = useState("Total Profit");   
  const [currentMode, setCurrentMode] = useState("local");
  

  const parseDate = (createdAt) => {
    if (!createdAt) return new Date();
    if (createdAt.seconds) return new Date(createdAt.seconds * 1000);
    return new Date(createdAt);
  };

  useEffect(() => {
    let unsubscribe;

    const loadDataLive = async () => {
      const session = await getSession();
      if (!session?.uid) return;

      const targetMode = appMode || "local";
      setCurrentMode(targetMode);

      if (unsubscribe) unsubscribe();

      unsubscribe = onSnapshot(
        collection(db, "users", session.uid, "sales"),
        (snap) => {
          const rows = snap.docs.map(d => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              total: Number(data.total || 0),
              profit: Number(data.profit || 0),
              isGlobalMode: data.isGlobalMode || false 
            };
          });

          const isTargetGlobal = targetMode === "global";
          // 🌟 ஸ்ட்ரிக்ட் ஃபில்டரிங்: லோக்கல் சேல்ஸ்ஸையும் குளோபல் சேல்ஸ்ஸையும் தனித்தனியாகப் பிரிக்கிறது
          const filteredRows = rows.filter(r => (r.isGlobalMode || false) === isTargetGlobal);

          filteredRows.sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt));
          setSales(filteredRows);
        },
        (error) => console.log("Firestore Sales error: ", error)
      );

      // Load specific profile credentials matching the mode
      const snap = await getDoc(doc(db, "users", session.uid));
      if (snap.exists()) {
        const uData = snap.data();
        setShopName(uData[`${targetMode}_shopName`] || uData.shopName || "MY SHOP");
      }
      const logo = await AsyncStorage.getItem(`${targetMode}_shopLogo_${session.uid}`);
      setShopLogo(logo || "");
    };

    if (isFocused || appMode) {
      loadDataLive();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isFocused, appMode]);

const reprintBill = async () => {
    if (!selectedBill) return;

    const billNo = selectedBill.billNo || selectedBill.invoiceId || "BILL-000001";
    const total = Number(selectedBill?.total || 0);
    const profit = Number(selectedBill?.profit || 0);
    
    // 🌟 பிக்ஸ்: 'tax' வேரியபிள் இல்லாததால் வந்த எர்ரர் இங்கு சரிசெய்யப்பட்டுள்ளது
    const tax = (total * 0).toFixed(2); 
    const grandTotal = (total + Number(tax)).toFixed(2);
    
    const formattedBillDate = parseDate(selectedBill?.createdAt).toLocaleString("en-GB");
    const pMode = selectedBill?.paymentMode || "CASH";

    let logoHtml = "";
    try {
      if (shopLogo) {
        const base64 = await RNFS.readFile(shopLogo.replace("file://", ""), "base64");
        logoHtml = `<img src="data:image/png;base64,${base64}" width="70" height="70" style="border-radius:10px;margin-right:15px;object-fit:cover;"/>`;
      }
    } catch (err) {
      console.log(err);
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
      <div class="center">Sales Invoice (${currentMode.toUpperCase()})</div>
      <div class="divider"></div>
      <div>Bill No: ${billNo}</div>
      <div>Date: ${formattedBillDate}</div>
      <div>Payment: ${pMode}</div>
      <div class="divider"></div>
      <table>
        ${selectedBill.items?.map(i => `
          <tr>
            <td>${i.itemName || i.name}<br/>&nbsp;&nbsp;${i.qty} x ₹${Number(i.price || i.salesPrice || 0).toFixed(2)}</td>
            <td class="right" style="vertical-align:bottom;">₹${(i.qty * Number(i.price || i.salesPrice || 0)).toFixed(2)}</td>
          </tr>
        `).join("")}
      </table>
      <div class="divider"></div>
      <div class="row"><span>Subtotal:</span><span>₹${total.toFixed(2)}</span></div>
      <div class="row" style="font-size:13px; font-weight:bold; border-top: 1px dashed #000; padding-top: 6px; margin-top: 4px;">
        <span>Grand Total:</span><span>₹${Number(grandTotal).toFixed(2)}</span>
      </div>
      <div class="divider"></div>
      <div class="center" style="margin-top:12px; font-style: italic;">Thank you for your business!</div>
    </body>
    </html>`;

    await RNPrint.print({ html });
  };

  const filteredSales = sales.filter(item => {
    const billNo = String(item.billNo || item.invoiceId || item.orderId || "").toLowerCase();
    const dateText = parseDate(item.createdAt).toLocaleDateString("en-GB");
    const query = search.toLowerCase().trim();
    return billNo.includes(query) || dateText.includes(query);
  });

  const now = new Date();

  const totalSales = sales.reduce((sum, item) => sum + Number(item.total || 0), 0);
  
  const todaySales = sales
    .filter(item => parseDate(item.createdAt).toDateString() === now.toDateString())
    .reduce((sum, item) => sum + Number(item.total || 0), 0);

  const monthlySales = sales
    .filter(item => {
      const d = parseDate(item.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, item) => sum + Number(item.total || 0), 0);

  const totalProfit = sales.reduce((sum, item) => sum + Number(item.profit || 0), 0);

  const monthlyProfit = sales
    .filter(item => {
      const d = parseDate(item.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, item) => sum + Number(item.profit || 0), 0);

  const todayProfit = sales
    .filter(item => parseDate(item.createdAt).toDateString() === now.toDateString())
    .reduce((sum, item) => sum + Number(item.profit || 0), 0);

  const toggleSalesView = () => {
    if (salesView === "Total Sales") setSalesView("Today Sales");
    else if (salesView === "Today Sales") setSalesView("This Month Sales");
    else setSalesView("Total Sales");
  };

  const toggleProfitView = () => {
    if (profitView === "Total Profit") setProfitView("This Month Profit");
    else if (profitView === "This Month Profit") setProfitView("Today Profit");
    else setProfitView("Total Profit");
  };

  const displaySalesVal = salesView === "Today Sales" ? todaySales : salesView === "This Month Sales" ? monthlySales : totalSales;
  const displayProfitVal = profitView === "This Month Profit" ? monthlyProfit : profitView === "Today Profit" ? todayProfit : totalProfit;

  const totalPages = Math.ceil(filteredSales.length / PAGE_SIZE);
  const paginatedSales = filteredSales.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, padding: 20 }}>
      <Text style={{ fontSize: 20, fontWeight: "700", marginBottom: 10, color: theme.text }}>
        Sales History ({currentMode === "global" ? "Global Shop" : "Local Shop"})
      </Text>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
        <View style={{ flex: 1, backgroundColor: "#22c55e", padding: 12, borderRadius: 16 }}>
          <TouchableOpacity onPress={toggleSalesView}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
              {salesView} ▼
            </Text>
          </TouchableOpacity>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold", marginTop: 5 }}>
            ₹ {displaySalesVal.toFixed(2)}
          </Text>
        </View>

        <View style={{ flex: 1, backgroundColor: "#2563eb", padding: 12, borderRadius: 16 }}>
          <TouchableOpacity onPress={toggleProfitView}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>
              {profitView} ▼
            </Text>
          </TouchableOpacity>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "bold", marginTop: 5 }}>
            ₹ {displayProfitVal.toFixed(2)}
          </Text>
        </View>
      </View>

      <TextInput
        placeholder="Search Bill No / Date (DD/MM/YYYY)"
        placeholderTextColor={theme.background === "#020617" ? "#94a3b8" : "#64748b"}
        value={search}
        onChangeText={(t) => {
          setSearch(t);
          setCurrentPage(1);
        }}
        style={{
          backgroundColor: theme.card,
          padding: 12,
          borderRadius: 12,
          marginBottom: 15,
          borderWidth: 1,
          borderColor: theme.border,
          color: theme.text,
          fontSize: 15,
        }}
      />

      <View style={{ height: 395 }}>
        <FlatList
          data={paginatedSales}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={true} 
          overScrollMode="never"
          contentContainerStyle={{ paddingBottom: 20, paddingHorizontal: 4 }} 
          renderItem={({ item }) => {
            const currentBillNo = String(item.billNo || item.invoiceId || "");
            const isOnlineSale = currentBillNo.startsWith("KADAI-") || currentBillNo.startsWith("ONL-") || item.paymentMode === "ONLINE";

            return (
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
                  shadowOpacity: 0.08, 
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: theme.text }}>
                    Bill No: {currentBillNo || "Old Bill"}
                  </Text>

                  {isOnlineSale && (
                    <View style={{ backgroundColor: "#ffedd5", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ color: "#c2410c", fontSize: 10, fontWeight: "800" }}>⚡ ONLINE SALE</Text>
                    </View>
                  )}
                </View>

                <Text style={{ marginTop: 8, fontSize: 17, fontWeight: "bold", color: "#16a34a" }}>
                  Total ₹ {Number(item.total || 0).toFixed(2)}
                </Text>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5 }}>
                  <Text style={{ color: "#64748b", fontSize: 14 }}>
                    Date: {parseDate(item.createdAt).toLocaleDateString()}
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#6366f1" }}>
                    Profit: ₹{Number(item.profit || 0).toFixed(2)}
                  </Text>
                </View>

                <Text style={{ marginTop: 10, color: "#6366f1", fontWeight: "600" }}>
                  Tap to View Full Bill →
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", marginTop: 40, color: theme.subText }}>
              No Sales Found
            </Text>
          }
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
          disabled={currentPage === totalPages || totalPages === 0}
          onPress={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
          style={{
            backgroundColor: (currentPage === totalPages || totalPages === 0) ? "#cbd5e1" : "#2563eb",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
            marginLeft: 8
          }}
        >
          <Text style={{ color: "#fff" }}>Next</Text>
        </TouchableOpacity>
      </View>

      {/* PREMIUM INVOICE MODAL POPUP */}
      <Modal
        visible={showBill}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBill(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.75)", justifyContent: "center", padding: 20 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 24, padding: 24, maxHeight: "85%", shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 }}>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="text-box-check-outline" size={24} color="#6366f1" />
                <Text style={{ fontSize: 20, fontWeight: "800", color: theme.text }}>
                  Bill Details
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowBill(false)} style={{ backgroundColor: '#f1f5f9', padding: 6, borderRadius: 20 }}>
                <Icon name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 15, flexWrap: 'wrap' }}>
              <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="tag-outline" size={14} color="#0369a1" />
                <Text style={{ color: "#0369a1", fontSize: 13, fontWeight: "700" }}>
                  ID: {selectedBill?.billNo || selectedBill?.invoiceId || "NO-ID"}
                </Text>
              </View>

              <View style={{ backgroundColor: '#f3e8ff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="credit-card-outline" size={14} color="#6b21a8" />
                <Text style={{ color: "#6b21a8", fontSize: 13, fontWeight: "700", textTransform: 'uppercase' }}>
                  {selectedBill?.paymentMode || "CASH"}
                </Text>
              </View>
            </View>

            <View style={{ 
              flexDirection: "row", 
              justifyContent: "space-between", 
              marginTop: 10, 
              paddingBottom: 8, 
              borderBottomWidth: 1.5, 
              borderBottomColor: theme.border 
            }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748b", flex: 2 }}>ITEMS</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748b", flex: 1, textAlign: "center" }}>QTY</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#64748b", flex: 1, textAlign: "right" }}>PRICE</Text>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 5 }}>
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
                    {i.qty} Qty
                  </Text>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: theme.text, flex: 1, textAlign: "right" }}>
                    ₹{Number((Number(i.price || i.salesPrice || 0) * Number(i.qty ?? 0))).toFixed(2)}
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
                ₹ {Number(selectedBill?.total || 0).toFixed(0)}
              </Text>
            </View>

            <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
              <TouchableOpacity
                onPress={() => setShowBill(false)}
                style={{ flex: 1, backgroundColor: darkMode ? "#334155" : "#e2e8f0", paddingVertical: 14, borderRadius: 14, alignItems: "center" }}
              >
                <Text style={{ color: darkMode ? "#cbd5e1" : "#334155", fontWeight: "700", fontSize: 15 }}>Close</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={reprintBill}
                style={{ flex: 1.3, backgroundColor: "#2563eb", paddingVertical: 14, borderRadius: 14, alignItems: "center", shadowColor: "#2563eb", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 }}
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