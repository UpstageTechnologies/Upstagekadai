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

import { db } from "../utils/firebaseConfig";
import { collection, onSnapshot, doc, getDoc, setDoc } from "firebase/firestore";

import RNPrint from "react-native-print";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { getSession } from "../utils/session";
import { ThemeContext } from "../theme/ThemeContext";

export default function SalesHistory({ appMode }) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const { theme, darkMode } = useContext(ThemeContext);
  const isFocused = useIsFocused();

  const [sales, setSales] = useState([]);
  const [selectedBill, setSelectedBill] = useState(null);
  const [showBill, setShowBill] = useState(false);
  const [search, setSearch] = useState("");
  const [shopName, setShopName] = useState("MY SHOP");
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

    const loadDataLive = async () => {
      const session = await getSession();
      if (!session?.uid) return;
      setUserId(session.uid);

      const targetMode = appMode || "local";
      setCurrentMode(targetMode);

      if (unsubscribe) unsubscribe();

      unsubscribe = onSnapshot(
        collection(db, "users", session.uid, "sales"),
        (snap) => {
          const rows = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
              total: Number(data.total || 0),
              profit: Number(data.profit || 0),
              isGlobalMode: data.isGlobalMode || false,
            };
          });

          const isTargetGlobal = targetMode === "global";
          const filteredRows = rows.filter(
            (r) => (r.isGlobalMode || false) === isTargetGlobal
          );
          filteredRows.sort(
            (a, b) => parseDate(b.createdAt) - parseDate(a.createdAt)
          );
          setSales(filteredRows);
        },
        (error) => console.log("Firestore Sales error: ", error)
      );

      try {
        const snap = await getDoc(doc(db, "users", session.uid));
        if (snap && snap.exists()) {
          const uData = snap.data();
          setShopName(uData[`${targetMode}_shopName`] || uData.shopName || "MY SHOP");
          setClosedDays(uData.closedDays || {});
        }
      } catch (err) {
        console.log("Offline mode error:", err);
      }
    };

    if (isFocused || appMode) {
      loadDataLive();
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

  // Group sales date-wise
  const groupedSales = useMemo(() => {
    const groups = {};

    sales.forEach((item) => {
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
          totalSales: 0,
          totalProfit: 0,
          totalOrders: 0,
          totalItemsSold: 0,
          cashTotal: 0,
          cardTotal: 0,
          qrTotal: 0,
          transferTotal: 0,
          payLaterTotal: 0,
          upiTotal: 0,
          razorpayTotal: 0,
          onlineTotal: 0,
          orders: [],
        };
      }

      const total = Number(item.total || 0);
      const profit = Number(item.profit || 0);
      const itemsCount = (item.items || []).reduce((acc, curr) => acc + (Number(curr.qty) || 1), 0);

      groups[dateKey].totalSales += total;
      groups[dateKey].totalProfit += profit;
      groups[dateKey].totalOrders += 1;
      groups[dateKey].totalItemsSold += itemsCount;
      groups[dateKey].orders.push(item);

      const pMode = String(item.paymentMode || "CASH").trim().toUpperCase();
      if (pMode === "ONLINE" || pMode.includes("ONLINE ORDER")) {
        groups[dateKey].onlineTotal += total;
      } else if (pMode.includes("RAZORPAY")) {
        groups[dateKey].razorpayTotal += total;
      } else if (pMode.includes("UPI") || pMode.includes("QR")) {
        groups[dateKey].upiTotal += total;
      } else {
        groups[dateKey].cashTotal += total;
      }
    });

    return Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
  }, [sales]);

  const filteredGroupedSales = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return groupedSales;
    return groupedSales.filter((group) => {
      const matchDate = group.dateKey.includes(q) || group.dateLabel.toLowerCase().includes(q);
      const matchBill = group.orders.some((o) =>
        String(o.billNo || o.invoiceId || "").toLowerCase().includes(q)
      );
      return matchDate || matchBill;
    });
  }, [groupedSales, search]);

  useEffect(() => {
    setCurrentPage(0);
  }, [search]);

  // Current Single Card Item
  const currentCard = filteredGroupedSales[currentPage] || null;

  // Pagination Window Logic
  const paginationDateItems = useMemo(() => {
    const total = filteredGroupedSales.length;
    if (total === 0) return [];

    const visibleCount = isLandscape ? 7 : 5;
    let start = Math.max(0, currentPage - Math.floor(visibleCount / 2));
    let end = Math.min(total, start + visibleCount);

    if (end - start < visibleCount) {
      start = Math.max(0, end - visibleCount);
    }

    const items = [];
    for (let i = start; i < end; i++) {
      items.push({
        index: i,
        dayNum: filteredGroupedSales[i].dayNum,
        dateKey: filteredGroupedSales[i].dateKey
      });
    }
    return items;
  }, [filteredGroupedSales, currentPage, isLandscape]);

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
        await setDoc(doc(db, "users", userId), { closedDays: updatePayload }, { merge: true });
        Alert.alert("Day Closed", "Day registers closed and recorded successfully.");
      } catch (e) {
        console.log("Firestore day close error:", e);
      }
    }
    setShowDayModal(false);
  };

  const reprintBill = async () => {
    if (!selectedBill) return;
    const billNo = selectedBill.displayBillNo || selectedBill.billNo || selectedBill.invoiceId || "BILL-000001";
    const total = Number(selectedBill?.total || 0);
    const formattedBillDate = parseDate(selectedBill?.createdAt).toLocaleString("en-GB");
    const pMode = selectedBill?.paymentMode || "CASH";

    const html = `
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        @page { size: 58mm auto; margin: 0mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, monospace; padding: 6mm 4mm; font-size: 12px; color: #111; }
        .center { text-align: center; } 
        .divider { border-top: 1px dashed #444; margin: 6px 0; }
        .row { display: flex; justify-content: space-between; }
        table { width: 100%; border-collapse: collapse; }
      </style>
    </head>
    <body>
      <div class="center" style="font-size:15px; font-weight: bold; text-transform: uppercase;">${shopName}</div>
      <div class="center" style="font-size: 11px; color: #555;">INVOICE (${currentMode.toUpperCase()})</div>
      <div class="divider"></div>
      <div>Bill No: ${billNo}</div>
      <div>Date: ${formattedBillDate}</div>
      <div>Payment: ${pMode}</div>
      <div class="divider"></div>
      <table>
        ${(selectedBill.items || []).map((i) => `
          <tr>
            <td>${i.itemName || i.name}<br/><span style="color:#666; font-size:11px">${i.qty} x ₹${Number(i.price || i.salesPrice || 0).toFixed(2)}</span></td>
            <td style="text-align:right; vertical-align:bottom; font-weight: bold;">₹${(i.qty * Number(i.price || i.salesPrice || 0)).toFixed(2)}</td>
          </tr>
        `).join("")}
      </table>
      <div class="divider"></div>
      <div class="row" style="font-weight: bold; font-size: 13px;"><span>Total:</span><span>₹${total.toFixed(2)}</span></div>
      <div class="divider"></div>
      <div class="center" style="margin-top:10px; font-size:11px;">Thank you! Visit again.</div>
    </body>
    </html>`;

    await RNPrint.print({ html });
  };

  const actualVal = parseFloat(actualCashInput) || 0;
  const expectedVal = selectedDayData?.cashTotal || 0;
  const diffVal = actualVal - expectedVal;

  const isToday = currentCard?.dateKey === new Date().toLocaleDateString("en-GB");
  const closedInfo = currentCard ? closedDays[currentCard.dateKey] : null;
  const isClosed = closedInfo?.isClosed || false;
  const cashDiff = closedInfo?.difference ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={darkMode ? "light-content" : "dark-content"} />

      {/* Main Vertical Scroll Container to prevent Bottom Nav collision */}
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: isLandscape ? 120 : 135 }}
      >
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View>
            <Text style={[styles.pageTitle, { color: theme.text }]}>Sales Register</Text>
            <Text style={styles.pageSubtitle}>
              {currentMode === "global" ? "🌐 Global Shop" : "🏬 Local Counter"}
            </Text>
          </View>
          <View style={styles.headerTag}>
            <Text style={styles.headerTagText}>{filteredGroupedSales.length} Days</Text>
          </View>
        </View>

        {/* Search Input */}
        <View style={[styles.searchWrapper, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Icon name="magnify" size={20} color="#94a3b8" style={{ marginRight: 8 }} />
          <TextInput
            placeholder="Search by date (DD/MM/YYYY) or bill no..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
            style={[styles.searchInput, { color: theme.text }]}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
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
                      <Icon name="calendar-month-outline" size={24} color={isToday ? "#10b981" : "#475569"} />
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
                        {currentCard.dateKey} · {currentCard.totalOrders} {currentCard.totalOrders === 1 ? "Order" : "Orders"}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.statusChip,
                      {
                        backgroundColor: !isClosed
                          ? "#fffbeb"
                          : cashDiff < 0
                          ? "#fee2e2"
                          : "#ecfdf5",
                        borderColor: !isClosed
                          ? "#fde68a"
                          : cashDiff < 0
                          ? "#fca5a5"
                          : "#a7f3d0",
                      },
                    ]}
                  >
                    <Icon
                      name={!isClosed ? "progress-clock" : cashDiff < 0 ? "alert-circle" : "check-decagram"}
                      size={14}
                      color={!isClosed ? "#f59e0b" : cashDiff < 0 ? "#dc2626" : "#10b981"}
                    />
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "800",
                        color: !isClosed ? "#d97706" : cashDiff < 0 ? "#dc2626" : "#10b981",
                      }}
                    >
                      {isClosed ? (cashDiff < 0 ? "SHORTAGE" : "CLOSED") : "OPEN"}
                    </Text>
                  </View>
                </View>

                {/* Big Hero Amount Focus */}
                <View style={styles.bigHeroAmountArea}>
                  <Text style={styles.heroAmountSub}>NET TOTAL SALES</Text>
                  <Text style={[styles.heroAmountValue, { color: theme.text }]}>
                    ₹{currentCard.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={styles.heroOrderSummary}>
                    {currentCard.totalItemsSold} total items sold across counter
                  </Text>
                </View>

                {/* Detailed Quick Analytics Grid */}
                <View style={[styles.metricsGrid, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: theme.border }]}>
                  <View style={styles.metricItem}>
                    <Icon name="receipt" size={17} color="#6366f1" />
                    <Text style={styles.metricLabel}>Total Orders</Text>
                    <Text style={[styles.metricValue, { color: theme.text }]}>{currentCard.totalOrders}</Text>
                  </View>
                  <View style={[styles.metricItem, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.border }]}>
                    <Icon name="cash" size={17} color="#10b981" />
                    <Text style={styles.metricLabel}>Cash In Hand</Text>
                    <Text style={[styles.metricValue, { color: "#10b981" }]}>₹{currentCard.cashTotal.toFixed(0)}</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Icon name="trending-up" size={17} color="#f59e0b" />
                    <Text style={styles.metricLabel}>Total Profit</Text>
                    <Text style={[styles.metricValue, { color: "#f59e0b" }]}>₹{currentCard.totalProfit.toFixed(0)}</Text>
                  </View>
                </View>

                {/* Variance Indicator */}
                {isClosed && (
                  <View
                    style={[
                      styles.cardVarianceBanner,
                      {
                        backgroundColor:
                          cashDiff < 0 ? "#fef2f2" : cashDiff > 0 ? "#eff6ff" : "#ecfdf5",
                        borderColor:
                          cashDiff < 0 ? "#fecaca" : cashDiff > 0 ? "#bfdbfe" : "#a7f3d0",
                      },
                    ]}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Icon
                        name={
                          cashDiff < 0
                            ? "alert-circle"
                            : cashDiff > 0
                            ? "plus-circle"
                            : "check-circle"
                        }
                        size={16}
                        color={
                          cashDiff < 0 ? "#dc2626" : cashDiff > 0 ? "#2563eb" : "#10b981"
                        }
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color:
                            cashDiff < 0 ? "#b91c1c" : cashDiff > 0 ? "#1d4ed8" : "#047857",
                        }}
                      >
                        {cashDiff < 0
                          ? "Cash Shortage"
                          : cashDiff > 0
                          ? "Excess Cash"
                          : "Cash Balanced"}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "800",
                        color:
                          cashDiff < 0 ? "#b91c1c" : cashDiff > 0 ? "#1d4ed8" : "#047857",
                      }}
                    >
                      {cashDiff < 0 ? `- ₹${Math.abs(cashDiff).toFixed(2)}` : cashDiff > 0 ? `+ ₹${cashDiff.toFixed(2)}` : "₹0.00"}
                    </Text>
                  </View>
                )}

                {/* Action Bar inside Card */}
                <View style={[styles.actionBanner, { backgroundColor: isClosed ? "#f1f5f9" : "#10b981" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Icon
                      name={isClosed ? "file-document-outline" : "cash-register"}
                      size={18}
                      color={isClosed ? "#334155" : "#ffffff"}
                    />
                    <Text style={[styles.actionBannerTitle, { color: isClosed ? "#334155" : "#ffffff" }]}>
                      {isClosed ? "View Reconciliation Summary" : "Reconcile Cash & Close Day"}
                    </Text>
                  </View>
                  <Icon name="arrow-right" size={18} color={isClosed ? "#334155" : "#ffffff"} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Right Column (Tablet View-Only Direct Panel for Bills & Breakdown) */}
            {isLandscape && (
              <View style={[styles.landscapeRightSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <View style={styles.tabletPanelHeader}>
                  <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                    Day End Bills ({currentCard.orders.length})
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleOpenDay(currentCard)}
                    style={{ backgroundColor: "#10b981", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Open Register</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 310 }}>
                  {(currentCard.orders || []).map((b, index) => {
                    const rawBillNo = String(b.billNo || b.invoiceId || b.orderId || "").trim();
                    let displayBillNo = "";

                    if (rawBillNo && !rawBillNo.startsWith("00") && rawBillNo.length <= 16) {
                      if (rawBillNo.toUpperCase().startsWith(`${shopPrefix}-`)) {
                        displayBillNo = rawBillNo;
                      } else {
                        displayBillNo = `${shopPrefix}-${rawBillNo}`;
                      }
                    } else {
                      const bDate = parseDate(b.createdAt);
                      const year = bDate.getFullYear();
                      const month = String(bDate.getMonth() + 1).padStart(2, "0");
                      const day = String(bDate.getDate()).padStart(2, "0");
                      const dateStr = `${year}${month}${day}`;
                      const seq = String(index + 1).padStart(3, "0");
                      displayBillNo = `${shopPrefix}-${dateStr}${seq}`;
                    }

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
                            {b.paymentMode || "CASH"} · {b.items?.length || 1} items
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
            <Text style={styles.emptyText}>No sales entries found</Text>
          </View>
        )}

        {/* Date-wise Pagination Bar */}
        {filteredGroupedSales.length > 0 && (
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
              disabled={currentPage === filteredGroupedSales.length - 1}
              onPress={() => setCurrentPage((p) => Math.min(filteredGroupedSales.length - 1, p + 1))}
              style={[
                styles.pageNavArrow,
                currentPage === filteredGroupedSales.length - 1 && styles.disabledNavArrow
              ]}
            >
              <Icon
                name="chevron-right"
                size={24}
                color={currentPage === filteredGroupedSales.length - 1 ? "#cbd5e1" : theme.text}
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
              <Text style={[styles.navTitle, { color: theme.text }]}>Day End Closing</Text>
              <Text style={styles.navSubTitle}>{selectedDayData?.dateLabel}</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
            {/* Net Collections Hero */}
            <View style={styles.heroBox}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.heroLabel}>Net Collections</Text>
                <View style={[styles.statusBadge, { backgroundColor: closedDays[selectedDayData?.dateKey]?.isClosed ? "#dcfce7" : "#fee2e2" }]}>
                  <Text style={{ color: closedDays[selectedDayData?.dateKey]?.isClosed ? "#15803d" : "#b91c1c", fontSize: 11, fontWeight: "800" }}>
                    {closedDays[selectedDayData?.dateKey]?.isClosed ? "CLOSED" : "NOT CLOSED"}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroAmount}>
                ₹{selectedDayData?.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </Text>

              <Text style={styles.heroSubText}>
                {selectedDayData?.totalOrders} total orders placed across all modes
              </Text>
            </View>

            {/* Payment Breakdown */}
            <View style={[styles.sectionBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Payment Breakdown</Text>
              {[
                { name: "Cash", icon: "cash", val: selectedDayData?.cashTotal || 0, color: "#10b981" },
                { name: "UPI", icon: "qrcode-scan", val: selectedDayData?.upiTotal || 0, color: "#06b6d4" },
                { name: "Razorpay", icon: "credit-card-outline", val: selectedDayData?.razorpayTotal || 0, color: "#3399cc" },
                { name: "Online Orders", icon: "truck-fast-outline", val: selectedDayData?.onlineTotal || 0, color: "#8b5cf6" },
              ].map((m, idx, arr) => (
                <View key={idx} style={[styles.payRow, { borderBottomWidth: idx !== arr.length - 1 ? 1 : 0, borderColor: theme.border }]}>
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
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Drawer Cash Reconciliation</Text>

              <View style={styles.cashSummaryRow}>
                <Text style={styles.lightLabel}>Expected Cash In Register</Text>
                <Text style={[styles.boldCash, { color: "#10b981" }]}>
                  ₹{expectedVal.toFixed(2)}
                </Text>
              </View>

              <Text style={[styles.inputHeading, { color: theme.text }]}>Actual Physical Cash Counted:</Text>
              <View style={[styles.cashInputContainer, { backgroundColor: darkMode ? "#1e293b" : "#f1f5f9", borderColor: theme.border }]}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#64748b", marginRight: 6 }}>₹</Text>
                <TextInput
                  placeholder="Enter counted cash..."
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
                      {diffVal < 0 ? "Cash Shortage (-)" : diffVal > 0 ? "Excess Cash (+)" : "Exact Match (Balanced)"}
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

            {/* Invoices List */}
            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 10, marginBottom: 10 }]}>
              Bills on {selectedDayData?.dateKey}
            </Text>
            {(selectedDayData?.orders || []).map((b, index) => {
              const rawBillNo = String(b.billNo || b.invoiceId || b.orderId || "").trim();
              let displayBillNo = "";

              if (rawBillNo && !rawBillNo.startsWith("00") && rawBillNo.length <= 16) {
                if (rawBillNo.toUpperCase().startsWith(`${shopPrefix}-`)) {
                  displayBillNo = rawBillNo;
                } else {
                  displayBillNo = `${shopPrefix}-${rawBillNo}`;
                }
              } else {
                const bDate = parseDate(b.createdAt);
                const year = bDate.getFullYear();
                const month = String(bDate.getMonth() + 1).padStart(2, "0");
                const day = String(bDate.getDate()).padStart(2, "0");
                const dateStr = `${year}${month}${day}`;
                const seq = String(index + 1).padStart(3, "0");
                displayBillNo = `${shopPrefix}-${dateStr}${seq}`;
              }

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
                      {b.paymentMode || "CASH"} · {b.items?.length || 1} items
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
              <Text style={[styles.billDetailTitle, { color: theme.text }]}>Bill Summary</Text>
              <TouchableOpacity onPress={() => setShowBill(false)} style={styles.iconCircle}>
                <Icon name="close" size={20} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.idChipRow}>
              <View style={styles.chipTag}>
                <Text style={styles.chipText}>{selectedBill?.displayBillNo || selectedBill?.billNo || "INVOICE"}</Text>
              </View>
              <View style={[styles.chipTag, { backgroundColor: selectedBill?.paymentMode === "ONLINE" ? "#ede9fe" : "#f3e8ff" }]}>
                <Text style={[styles.chipText, { color: selectedBill?.paymentMode === "ONLINE" ? "#6d28d9" : "#7e22ce" }]}>
                  {selectedBill?.paymentMode || "CASH"}
                </Text>
              </View>
            </View>

            <ScrollView style={{ maxHeight: 220, marginVertical: 12 }}>
              {(selectedBill?.items || []).map((i, idx) => (
                <View key={idx} style={[styles.itemDetailRow, { borderColor: theme.border }]}>
                  <View style={{ flex: 2 }}>
                    <Text style={[styles.itemTitle, { color: theme.text }]}>{i.itemName || i.name}</Text>
                    <Text style={styles.itemSubtitle}>{i.qty} x ₹{Number(i.price || i.salesPrice || 0).toFixed(2)}</Text>
                  </View>
                  <Text style={[styles.itemSubtotal, { color: theme.text }]}>
                    ₹{(Number(i.price || i.salesPrice || 0) * Number(i.qty || 1)).toFixed(2)}
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

  // Responsive Master Layout (Scrollable container protects against bottom nav)
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
  cardVarianceBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
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