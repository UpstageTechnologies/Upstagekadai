import React, { useEffect, useState, useContext, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  StyleSheet,
  Platform,
  Alert,
  StatusBar,
  useWindowDimensions
} from "react-native";
import { useIsFocused } from "@react-navigation/native";

import { auth, db } from "../utils/firebaseConfig";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc
} from "firebase/firestore";

import RNFS from "react-native-fs";
import RNPrint from "react-native-print";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { getSession } from "../utils/session";
import { ThemeContext } from "../theme/ThemeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function PurchaseHistory({ appMode }) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { theme, darkMode } = useContext(ThemeContext);
  const isFocused = useIsFocused();

  const [items, setItems] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [showBill, setShowBill] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [shopName, setShopName] = useState("MY SHOP");
  const [shopLogo, setShopLogo] = useState("");
  const [currentMode, setCurrentMode] = useState("local");
  const [userId, setUserId] = useState(null);

  // Pagination State (Single Card View per page)
  const [currentPage, setCurrentPage] = useState(0);

  // Day Close Modals & States
  const [selectedDayData, setSelectedDayData] = useState(null);
  const [showDayModal, setShowDayModal] = useState(false);
  const [actualCashInput, setActualCashInput] = useState("");
  const [closedDays, setClosedDays] = useState({});

  const parseDate = (createdAt) => {
    if (!createdAt) return new Date();
    if (createdAt.seconds) return new Date(createdAt.seconds * 1000);
    return new Date(createdAt);
  };

  useEffect(() => {
    let unsubscribe;

    const loadPurchases = async () => {
      let uid = auth.currentUser?.uid;
      if (!uid) {
        const session = await getSession();
        uid = session?.uid;
      }
      if (!uid) return;
      setUserId(uid);

      const targetMode = appMode || "local";
      setCurrentMode(targetMode);

      const collectionName = targetMode === "global" ? "global_invoices" : "invoices";

      if (unsubscribe) unsubscribe();

      unsubscribe = onSnapshot(
        collection(db, "users", uid, collectionName),
        (snapshot) => {
          let rows = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            total: Number(d.data().total || 0),
          }));

          rows.sort(
            (a, b) => parseDate(b.createdAt) - parseDate(a.createdAt)
          );

          setItems(rows);
        },
        (error) => console.log("Firestore Purchase error: ", error)
      );

      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap && snap.exists()) {
          const uData = snap.data();
          setShopName(uData[`${targetMode}_shopName`] || uData.shopName || "MY SHOP");
          setClosedDays(uData.closedPurchaseDays || {});
        }
      } catch (err) {
        console.log("Offline mode error:", err);
      }

      try {
        const logo = await AsyncStorage.getItem(`shopLogo_${uid}`);
        if (logo) setShopLogo(logo);
      } catch (e) {
        console.log("Storage load error:", e);
      }
    };

    if (isFocused || appMode) {
      loadPurchases();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isFocused, appMode]);

  // Shop Name Prefix Generator
  const shopPrefix = useMemo(() => {
    const cleanName = (shopName || "MY SHOP").trim().replace(/[^a-zA-Z0-9\s]/g, "");
    const words = cleanName.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      return (words[0][0] + words[1][0]).toUpperCase();
    } else if (words.length === 1 && words[0].length >= 2) {
      return words[0].slice(0, 2).toUpperCase();
    }
    return "SM";
  }, [shopName]);

  // Group purchases date-wise with 3 payment modes (UPI, Cash, Razorpay)
  const groupedPurchases = useMemo(() => {
    const groups = {};

    items.forEach((item) => {
      const dateObj = parseDate(item.createdAt);
      const dateKey = dateObj.toLocaleDateString("en-GB");
      const dateLabel = dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      });
      const dayNum = dateObj.getDate();

      if (!groups[dateKey]) {
        groups[dateKey] = {
          dateKey,
          dateLabel,
          dayNum,
          timestamp: dateObj.getTime(),
          totalPurchase: 0,
          totalInvoices: 0,
          totalItemsBought: 0,
          cashTotal: 0,
          upiTotal: 0,
          razorpayTotal: 0,
          invoices: [],
        };
      }

      const total = Number(item.total || 0);
      const itemsCount = (item.items || []).reduce((acc, curr) => acc + (Number(curr.qty) || 1), 0);

      groups[dateKey].totalPurchase += total;
      groups[dateKey].totalInvoices += 1;
      groups[dateKey].totalItemsBought += itemsCount;
      groups[dateKey].invoices.push(item);

      const pMode = (item.paymentMode || "CASH").toUpperCase();
      if (pMode.includes("RAZORPAY")) {
        groups[dateKey].razorpayTotal += total;
      } else if (pMode.includes("UPI") || pMode.includes("QR") || pMode.includes("ONLINE")) {
        groups[dateKey].upiTotal += total;
      } else {
        groups[dateKey].cashTotal += total;
      }
    });

    return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
  }, [items]);

  const filteredGroupedPurchases = useMemo(() => {
    const q = searchText.toLowerCase().trim();
    if (!q) return groupedPurchases;
    return groupedPurchases.filter((group) => {
      const matchDate = group.dateKey.includes(q) || group.dateLabel.toLowerCase().includes(q);
      const matchBill = group.invoices.some((o) =>
        String(o.billNo || o.invoiceId || o.supplierName || "").toLowerCase().includes(q)
      );
      return matchDate || matchBill;
    });
  }, [groupedPurchases, searchText]);

  useEffect(() => {
    setCurrentPage(0);
  }, [searchText]);

  const currentCard = filteredGroupedPurchases[currentPage] || null;

  const paginationDateItems = useMemo(() => {
    const total = filteredGroupedPurchases.length;
    if (total === 0) return [];

    const visibleCount = isLandscape ? 7 : 5;
    let start = Math.max(0, currentPage - Math.floor(visibleCount / 2));
    let end = Math.min(total, start + visibleCount);

    if (end - start < visibleCount) {
      start = Math.max(0, end - visibleCount);
    }

    const pItems = [];
    for (let i = start; i < end; i++) {
      pItems.push({
        index: i,
        dayNum: filteredGroupedPurchases[i].dayNum,
        dateKey: filteredGroupedPurchases[i].dateKey
      });
    }
    return pItems;
  }, [filteredGroupedPurchases, currentPage, isLandscape]);

  const handleOpenDay = (dayData) => {
    setSelectedDayData(dayData);
    setActualCashInput(closedDays[dayData.dateKey]?.actualCash?.toString() || "");
    setShowDayModal(true);
  };

  const handleCloseDaySave = async () => {
    if (!actualCashInput) {
      Alert.alert("Input Required", "Please enter the actual physical cash amount.");
      return;
    }

    const actual = parseFloat(actualCashInput) || 0;
    const expected = selectedDayData.cashTotal;
    const diff = actual - expected;

    const updatePayload = {
      ...closedDays,
      [selectedDayData.dateKey]: {
        isClosed: true,
        actualCash: actual,
        expectedCash: expected,
        difference: diff,
        closedAt: new Date().toISOString(),
      },
    };

    setClosedDays(updatePayload);

    if (userId) {
      try {
        await setDoc(doc(db, "users", userId), { closedPurchaseDays: updatePayload }, { merge: true });
        Alert.alert("Day Closed", "Purchase registers closed and recorded successfully.");
      } catch (e) {
        console.log("Firestore purchase day close error:", e);
      }
    }
    setShowDayModal(false);
  };

  const reprintBill = async () => {
    if (!selectedBill || !selectedBill.items) return;

    const purchaseTotal = selectedBill.items.reduce(
      (sum, i) => sum + (Number(i.purchasePrice || i.price || 0)) * Number(i.qty || 1),
      0
    );

    const tax = (purchaseTotal * 0.05).toFixed(2);
    const purchaseNo = selectedBill.displayBillNo || selectedBill.billNo || selectedBill.invoiceId || "PUR-0000";
    const purchaseDate = parseDate(selectedBill.createdAt).toLocaleDateString("en-GB");

    let logoHtml = "";
    try {
      if (shopLogo) {
        const base64 = await RNFS.readFile(shopLogo.replace("file://", ""), "base64");
        logoHtml = `<img src="data:image/png;base64,${base64}" width="70" height="70" style="border-radius:10px;margin-right:15px;object-fit:cover;"/>`;
      }
    } catch (err) {
      console.log("Logo Error:", err);
    }

    const html = `
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @page { size: 58mm auto; margin: 0mm; }
        body { font-family: monospace; padding: 6mm 4mm; font-size: 12px; color: #000; font-weight: bold; }
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
        ${selectedBill.items.map((i) => `
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

  const actualVal = parseFloat(actualCashInput) || 0;
  const expectedVal = selectedDayData?.cashTotal || 0;
  const diffVal = actualVal - expectedVal;

  const isToday = currentCard?.dateKey === new Date().toLocaleDateString("en-GB");
  const isClosed = currentCard ? closedDays[currentCard.dateKey]?.isClosed : false;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} />

      {/* Main Vertical Scroll Container to prevent Bottom Nav collision in Landscape */}
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: isLandscape ? 120 : 135 }}
      >
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View>
            <Text style={[styles.pageTitle, { color: theme.text }]}>Purchase Register</Text>
            <Text style={styles.pageSubtitle}>
              {currentMode === "global" ? "🌐 Global Purchase" : "🏬 Local Purchase"}
            </Text>
          </View>
          <View style={styles.headerTag}>
            <Text style={styles.headerTagText}>{filteredGroupedPurchases.length} Days</Text>
          </View>
        </View>

        {/* Search Input */}
        <View style={[styles.searchWrapper, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Icon name="magnify" size={20} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search by date (DD/MM/YYYY), bill no, supplier..."
            placeholderTextColor="#94a3b8"
            value={searchText}
            onChangeText={setSearchText}
            style={[styles.searchInput, { color: theme.text }]}
          />
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText("")}>
              <Icon name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Main Content Area */}
        {currentCard ? (
          <View style={[styles.mainLayout, isLandscape && styles.landscapeMainLayout]}>
            
            {/* Left Column (Main Card Summary) */}
            <View style={[styles.leftSection, isLandscape && styles.landscapeLeftSection]}>
              <TouchableOpacity
                activeOpacity={0.94}
                onPress={() => handleOpenDay(currentCard)}
                style={[
                  styles.largeDayCard,
                  {
                    backgroundColor: theme.card,
                    borderColor: isToday ? "#10b981" : theme.border,
                  },
                ]}
              >
                {/* Header Badge */}
                <View style={styles.largeCardHeader}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={[styles.largeIconBox, { backgroundColor: isToday ? "#ecfdf5" : "#f1f5f9" }]}>
                      <Icon name="calendar-month-outline" size={26} color={isToday ? "#10b981" : "#475569"} />
                    </View>
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={[styles.largeDateTitle, { color: theme.text }]}>
                          {isToday ? "Today" : currentCard.dateLabel}
                        </Text>
                        {isToday && (
                          <View style={styles.livePill}>
                            <Text style={styles.livePillText}>LIVE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.largeDateMeta}>
                        {currentCard.dateKey} · {currentCard.totalInvoices} Invoices
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.statusChip, { backgroundColor: isClosed ? "#ecfdf5" : "#fffbeb", borderColor: isClosed ? "#a7f3d0" : "#fde68a" }]}>
                    <Icon
                      name={isClosed ? "check-decagram" : "progress-clock"}
                      size={14}
                      color={isClosed ? "#10b981" : "#f59e0b"}
                    />
                    <Text style={{ fontSize: 11, fontWeight: "800", color: isClosed ? "#10b981" : "#d97706" }}>
                      {isClosed ? "CLOSED" : "OPEN"}
                    </Text>
                  </View>
                </View>

                {/* Big Hero Amount Focus */}
                <View style={styles.bigHeroAmountArea}>
                  <Text style={styles.heroAmountSub}>TOTAL PURCHASE EXPENSE</Text>
                  <Text style={[styles.heroAmountValue, { color: theme.text }]}>
                    ₹{currentCard.totalPurchase.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.heroOrderSummary}>
                    {currentCard.totalItemsBought} total items stocked
                  </Text>
                </View>

                {/* Detailed Quick Analytics Grid */}
                <View style={[styles.metricsGrid, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: theme.border }]}>
                  <View style={styles.metricItem}>
                    <Icon name="receipt" size={17} color="#6366f1" />
                    <Text style={styles.metricLabel}>Total Invoices</Text>
                    <Text style={[styles.metricValue, { color: theme.text }]}>{currentCard.totalInvoices}</Text>
                  </View>
                  <View style={[styles.metricItem, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.border }]}>
                    <Icon name="cash" size={17} color="#10b981" />
                    <Text style={styles.metricLabel}>Cash Paid</Text>
                    <Text style={[styles.metricValue, { color: "#10b981" }]}>₹{currentCard.cashTotal.toFixed(0)}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Icon name="qrcode-scan" size={17} color="#06b6d4" />
                    <Text style={styles.metricLabel}>UPI / Online</Text>
                    <Text style={[styles.metricValue, { color: "#06b6d4" }]}>₹{(currentCard.upiTotal + currentCard.razorpayTotal).toFixed(0)}</Text>
                  </View>
                </View>

                {/* Action Bar inside Card */}
                <View style={[styles.actionBanner, { backgroundColor: isClosed ? "#f1f5f9" : "#10b981" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon
                      name={isClosed ? "file-document-outline" : "cash-register"}
                      size={18}
                      color={isClosed ? "#334155" : "#ffffff"}
                    />
                    <Text style={[styles.actionBannerTitle, { color: isClosed ? "#334155" : "#ffffff" }]}>
                      {isClosed ? "View Reconciliation Summary" : "Reconcile Expense & Close Day"}
                    </Text>
                  </View>
                  <Icon name="arrow-right" size={18} color={isClosed ? "#334155" : "#ffffff"} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Right Column (Tablet View-Only Direct Panel for Invoices List) */}
            {isLandscape && (
              <View style={[styles.landscapeRightSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.tabletPanelHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                    Invoices on {currentCard.dateKey} ({currentCard.invoices.length})
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleOpenDay(currentCard)}
                    style={{ backgroundColor: "#10b981", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Open Day</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 310 }}>
                  {(currentCard.invoices || []).map((b, index) => {
                    const bDate = parseDate(b.createdAt);
                    const year = bDate.getFullYear();
                    const day = String(bDate.getDate()).padStart(2, "0");
                    const month = String(bDate.getMonth() + 1).padStart(2, "0");
                    const seq = String(index + 1).padStart(3, "0");
                    const displayBillNo = `${shopPrefix}-${year}${day}${month}${seq}`;

                    return (
                      <TouchableOpacity
                        key={b.id}
                        onPress={() => {
                          setSelectedBill({ ...b, displayBillNo });
                          setShowBill(true);
                        }}
                        style={[styles.billItemRow, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: theme.border }]}
                      >
                        <View>
                          <Text style={[styles.billItemNo, { color: theme.text }]}>
                            {displayBillNo}
                          </Text>
                          <Text style={styles.billItemMeta}>
                            Supplier: {b.supplierName || "-"} · {b.paymentMode || "CASH"}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.billItemPrice}>
                            ₹{Number(b.total || 0).toFixed(2)}
                          </Text>
                          <Text style={{ fontSize: 11, color: "#6366f1", fontWeight: "600" }}>View →</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Icon name="folder-open-outline" size={54} color="#94a3b8" />
            <Text style={styles.emptyText}>No purchase entries found</Text>
          </View>
        )}

        {/* Date-wise Pagination Bar */}
        {filteredGroupedPurchases.length > 0 && (
          <View style={[styles.datePaginationBar, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 8 }]}>
            <TouchableOpacity
              disabled={currentPage === 0}
              onPress={() => setCurrentPage((p) => Math.max(0, p - 1))}
              style={[styles.pageNavArrow, currentPage === 0 && styles.disabledNavArrow]}
            >
              <Icon name="chevron-left" size={24} color={currentPage === 0 ? "#cbd5e1" : theme.text} />
            </TouchableOpacity>

            <View style={styles.datePillsContainer}>
              {paginationDateItems.map((item) => {
                const isSelected = item.index === currentPage;
                return (
                  <TouchableOpacity
                    key={item.dateKey}
                    onPress={() => setCurrentPage(item.index)}
                    style={[
                      styles.dateNumPill,
                      isSelected && styles.selectedDateNumPill,
                      { borderColor: isSelected ? "#10b981" : theme.border }
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateNumPillText,
                        { color: isSelected ? "#ffffff" : theme.text }
                      ]}
                    >
                      {item.dayNum}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              disabled={currentPage === filteredGroupedPurchases.length - 1}
              onPress={() => setCurrentPage((p) => Math.min(filteredGroupedPurchases.length - 1, p + 1))}
              style={[
                styles.pageNavArrow,
                currentPage === filteredGroupedPurchases.length - 1 && styles.disabledNavArrow
              ]}
            >
              <Icon
                name="chevron-right"
                size={24}
                color={currentPage === filteredGroupedPurchases.length - 1 ? "#cbd5e1" : theme.text}
              />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* CLOSE DAY SCREEN MODAL */}
      <Modal visible={showDayModal} animationType="slide" onRequestClose={() => setShowDayModal(false)}>
        <View style={[styles.modalScreen, { backgroundColor: theme.background }]}>
          <View style={[styles.modalTopNav, { borderColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowDayModal(false)} style={styles.navCloseBtn}>
              <Icon name="arrow-left" size={22} color={theme.text} />
            </TouchableOpacity>
            <View style={{ marginLeft: 12 }}>
              <Text style={[styles.navTitle, { color: theme.text }]}>Purchase Day Summary</Text>
              <Text style={styles.navSubTitle}>{selectedDayData?.dateLabel}</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
            {/* Net Collections Hero */}
            <View style={styles.heroBox}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.heroLabel}>Total Purchases</Text>
                <View style={[styles.statusBadge, { backgroundColor: closedDays[selectedDayData?.dateKey]?.isClosed ? "#dcfce7" : "#fee2e2" }]}>
                  <Text style={{ color: closedDays[selectedDayData?.dateKey]?.isClosed ? "#15803d" : "#b91c1c", fontSize: 11, fontWeight: "800" }}>
                    {closedDays[selectedDayData?.dateKey]?.isClosed ? "CLOSED" : "NOT CLOSED"}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroAmount}>
                ₹{selectedDayData?.totalPurchase.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </Text>

              <Text style={styles.heroSubText}>
                {selectedDayData?.totalInvoices} invoices across all suppliers
              </Text>
            </View>

            {/* Payment Breakdown - Only Cash, UPI, Razorpay */}
            <View style={[styles.sectionBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Payment Breakdown</Text>
              {[
                { name: "Cash", icon: "cash", val: selectedDayData?.cashTotal || 0, color: "#10b981" },
                { name: "UPI", icon: "qrcode-scan", val: selectedDayData?.upiTotal || 0, color: "#06b6d4" },
                { name: "Razorpay", icon: "credit-card-outline", val: selectedDayData?.razorpayTotal || 0, color: "#3399cc" },
              ].map((m, idx) => (
                <View key={idx} style={[styles.payRow, { borderBottomWidth: idx !== 2 ? 1 : 0, borderColor: theme.border }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={[styles.miniIcon, { backgroundColor: `${m.color}15` }]}>
                      <Icon name={m.icon} size={18} color={m.color} />
                    </View>
                    <Text style={[styles.payMethodText, { color: theme.text }]}>{m.name}</Text>
                  </View>
                  <Text style={[styles.payMethodVal, { color: theme.text }]}>
                    ₹{m.val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              ))}
            </View>

            {/* Cash Verification */}
            <View style={[styles.sectionBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Cash Paid Verification</Text>

              <View style={styles.cashSummaryRow}>
                <Text style={styles.lightLabel}>Expected Cash Paid</Text>
                <Text style={[styles.boldCash, { color: "#10b981" }]}>
                  ₹{expectedVal.toFixed(2)}
                </Text>
              </View>

              <Text style={[styles.inputHeading, { color: theme.text }]}>Actual Cash Outflow Counted:</Text>
              <View style={[styles.cashInputContainer, { backgroundColor: darkMode ? "#1e293b" : "#f1f5f9", borderColor: theme.border }]}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#64748b", marginRight: 6 }}>₹</Text>
                <TextInput
                  placeholder="Enter counted cash paid..."
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={actualCashInput}
                  onChangeText={setActualCashInput}
                  style={[styles.numericInput, { color: theme.text }]}
                />
              </View>

              {actualCashInput !== "" && (
                <View style={[
                  styles.varianceCard,
                  {
                    backgroundColor: diffVal < 0 ? "#fef2f2" : diffVal > 0 ? "#eff6ff" : "#ecfdf5",
                    borderColor: diffVal < 0 ? "#fecaca" : diffVal > 0 ? "#bfdbfe" : "#a7f3d0",
                  }
                ]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon
                      name={diffVal < 0 ? "alert-circle" : diffVal > 0 ? "plus-circle" : "check-circle"}
                      size={20}
                      color={diffVal < 0 ? "#dc2626" : diffVal > 0 ? "#2563eb" : "#10b981"}
                    />
                    <Text style={{
                      fontWeight: "700",
                      fontSize: 14,
                      color: diffVal < 0 ? "#b91c1c" : diffVal > 0 ? "#1d4ed8" : "#047857"
                    }}>
                      {diffVal < 0 ? "Expense Shortage (-)" : diffVal > 0 ? "Excess Cash Paid (+)" : "Exact Match (Balanced)"}
                    </Text>
                  </View>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: "900",
                    color: diffVal < 0 ? "#b91c1c" : diffVal > 0 ? "#1d4ed8" : "#047857"
                  }}>
                    ₹{Math.abs(diffVal).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>

            {/* Invoices List with SM-YYYYDDMM001 Format */}
            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 10, marginBottom: 10 }]}>
              Invoices on {selectedDayData?.dateKey}
            </Text>
            {(selectedDayData?.invoices || []).map((b, index) => {
              const bDate = parseDate(b.createdAt);
              const year = bDate.getFullYear();
              const day = String(bDate.getDate()).padStart(2, "0");
              const month = String(bDate.getMonth() + 1).padStart(2, "0");
              const seq = String(index + 1).padStart(3, "0");
              const displayBillNo = `${shopPrefix}-${year}${day}${month}${seq}`;

              return (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => {
                    setSelectedBill({ ...b, displayBillNo });
                    setShowBill(true);
                  }}
                  style={[styles.billItemRow, { backgroundColor: theme.card, borderColor: theme.border }]}
                >
                  <View>
                    <Text style={[styles.billItemNo, { color: theme.text }]}>
                      {displayBillNo}
                    </Text>
                    <Text style={styles.billItemMeta}>
                      Supplier: {b.supplierName || "-"} · {b.paymentMode || "CASH"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.billItemPrice}>
                      ₹{Number(b.total || 0).toFixed(2)}
                    </Text>
                    <Text style={{ fontSize: 11, color: "#6366f1", fontWeight: "600" }}>View →</Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Submit Button */}
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={handleCloseDaySave}
              style={styles.closeDayMainBtn}
            >
              <Icon name="check-bold" size={20} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.closeDayBtnText}>Record & Close Day</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* DETAILED BILL MODAL */}
      <Modal visible={showBill} transparent={true} animationType="fade" onRequestClose={() => setShowBill(false)}>
        <View style={styles.billModalBackdrop}>
          <View style={[styles.billModalCard, { backgroundColor: theme.card }]}>
            <View style={styles.billHeaderRow}>
              <Text style={[styles.billDetailTitle, { color: theme.text }]}>Invoice Summary</Text>
              <TouchableOpacity onPress={() => setShowBill(false)} style={styles.iconCircle}>
                <Icon name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.idChipRow}>
              <View style={styles.chipTag}>
                <Text style={styles.chipText}>{selectedBill?.displayBillNo || selectedBill?.billNo || "INVOICE"}</Text>
              </View>
              <View style={[styles.chipTag, { backgroundColor: "#f3e8ff" }]}>
                <Text style={[styles.chipText, { color: "#7e22ce" }]}>{selectedBill?.paymentMode || "CASH"}</Text>
              </View>
              <View style={[styles.chipTag, { backgroundColor: "#fef3c7" }]}>
                <Text style={[styles.chipText, { color: "#b45309" }]}>Supplier: {selectedBill?.supplierName || "-"}</Text>
              </View>
            </View>

            <ScrollView style={{ maxHeight: 220, marginVertical: 12 }}>
              {(selectedBill?.items || []).map((i, idx) => (
                <View key={idx} style={[styles.itemDetailRow, { borderColor: theme.border }]}>
                  <View style={{ flex: 2 }}>
                    <Text style={[styles.itemTitle, { color: theme.text }]}>{i.itemName || i.name}</Text>
                    <Text style={styles.itemSubtitle}>{i.qty} {i.unitType || "Qty"} x ₹{Number(i.purchasePrice || i.price || 0).toFixed(2)}</Text>
                  </View>
                  <Text style={[styles.itemSubtotal, { color: theme.text }]}>
                    ₹{(Number(i.purchasePrice || i.price || 0) * Number(i.qty || 1)).toFixed(2)}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={[styles.grandTotalBar, { borderColor: theme.border }]}>
              <Text style={[styles.grandTotalLabel, { color: theme.text }]}>Grand Total</Text>
              <Text style={styles.grandTotalAmount}>₹{Number(selectedBill?.total || 0).toFixed(2)}</Text>
            </View>

            <View style={styles.modalActionButtons}>
              <TouchableOpacity onPress={() => setShowBill(false)} style={styles.cancelBtn}>
                <Text style={styles.cancelBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={reprintBill} style={styles.printBtn}>
                <Icon name="printer-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.printBtnText}>Reprint</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 14 : 36,
  },
  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 2,
    fontWeight: "600",
  },
  headerTag: {
    backgroundColor: "#e2e8f0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  headerTagText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },

  // Responsive Master Layout
  mainLayout: {
    width: "100%",
    marginBottom: 12,
  },
  landscapeMainLayout: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  leftSection: {
    width: "100%",
  },
  landscapeLeftSection: {
    flex: 1,
  },
  landscapeRightSection: {
    flex: 1.1,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
  },
  tabletPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },

  largeDayCard: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
  },
  largeCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  largeIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  largeDateTitle: {
    fontSize: 19,
    fontWeight: "800",
  },
  largeDateMeta: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
    fontWeight: "500",
  },
  livePill: {
    backgroundColor: "#10b981",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  livePillText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "900",
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  bigHeroAmountArea: {
    alignItems: "center",
    marginVertical: 12,
    paddingVertical: 4,
  },
  heroAmountSub: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    letterSpacing: 1,
  },
  heroAmountValue: {
    fontSize: 32,
    fontWeight: "900",
    marginVertical: 4,
    letterSpacing: -0.5,
  },
  heroOrderSummary: {
    fontSize: 12,
    color: "#10b981",
    fontWeight: "700",
  },
  metricsGrid: {
    flexDirection: "row",
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    marginBottom: 12,
  },
  metricItem: {
    flex: 1,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
    marginTop: 4,
  },
  metricValue: {
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },
  actionBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  actionBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
  },

  // Pagination Date Bar
  datePaginationBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
  },
  pageNavArrow: {
    padding: 8,
    borderRadius: 12,
  },
  disabledNavArrow: {
    opacity: 0.4,
  },
  datePillsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateNumPill: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  selectedDateNumPill: {
    backgroundColor: "#10b981",
    borderColor: "#10b981",
    elevation: 3,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  dateNumPillText: {
    fontSize: 14,
    fontWeight: "800",
  },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 15,
    color: "#94a3b8",
    fontWeight: "600",
  },

  // Modal Screen Styles
  modalScreen: {
    flex: 1,
  },
  modalTopNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  navCloseBtn: {
    padding: 6,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  navSubTitle: {
    fontSize: 12,
    color: "#64748b",
  },
  heroBox: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#065f46",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: "900",
    color: "#047857",
    marginVertical: 6,
  },
  heroSubText: {
    fontSize: 12,
    color: "#047857",
    opacity: 0.8,
  },
  sectionBox: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 12,
  },
  payRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
  },
  miniIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  payMethodText: {
    fontSize: 14,
    fontWeight: "600",
  },
  payMethodVal: {
    fontSize: 14,
    fontWeight: "700",
  },
  cashSummaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  lightLabel: {
    fontSize: 13,
    color: "#64748b",
  },
  boldCash: {
    fontSize: 17,
    fontWeight: "800",
  },
  inputHeading: {
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  cashInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  numericInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    padding: 0,
  },
  varianceCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  billItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  billItemNo: {
    fontSize: 13,
    fontWeight: "700",
  },
  billItemMeta: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  billItemPrice: {
    fontSize: 14,
    fontWeight: "800",
    color: "#10b981",
  },
  closeDayMainBtn: {
    backgroundColor: "#10b981",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 14,
    elevation: 4,
  },
  closeDayBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },

  // Invoice Pop-up styles
  billModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    justifyContent: "center",
    padding: 20,
  },
  billModalCard: {
    borderRadius: 24,
    padding: 22,
    maxHeight: "85%",
  },
  billHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  billDetailTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  iconCircle: {
    backgroundColor: "#f1f5f9",
    padding: 6,
    borderRadius: 20,
  },
  idChipRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  chipTag: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0369a1",
  },
  itemDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  itemSubtitle: {
    fontSize: 12,
    color: "#64748b",
  },
  itemSubtotal: {
    fontSize: 14,
    fontWeight: "700",
  },
  grandTotalBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1.5,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  grandTotalAmount: {
    fontSize: 22,
    fontWeight: "900",
    color: "#10b981",
  },
  modalActionButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: "#f1f5f9",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "#475569",
    fontWeight: "700",
    fontSize: 14,
  },
  printBtn: {
    flex: 1.4,
    backgroundColor: "#2563eb",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  printBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});