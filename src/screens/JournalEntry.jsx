import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal, 
} from "react-native";

import {
  collection,
  onSnapshot,
  getDoc,
  doc
} from "firebase/firestore";

import { auth, db } from "../utils/firebaseConfig";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import RNPrint from "react-native-print";
import AsyncStorage from "@react-native-async-storage/async-storage";
import RNFS from "react-native-fs";
import { useTheme } from "../theme/ThemeContext"; // 🌟 Added Theme Hook
import { getSession } from "../utils/session";
export default function JournalEntry({ navigation }) {
  const { darkMode, theme } = useTheme(); // 🌟 Access theme properties
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(new Date());
  const [toDate, setToDate] = useState(new Date());
  const [showFrom, setShowFrom] = useState(false);
  const [showTo, setShowTo] = useState(false);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [filteredSales, setFilteredSales] = useState(0);
  const [filteredPurchase, setFilteredPurchase] = useState(0);
  const [filteredProfit, setFilteredProfit] = useState(0);
  const [shopName, setShopName] = useState("MY SHOP");
  const [shopLogo, setShopLogo] = useState("");
  
  const [currentMode, setCurrentMode] = useState("local");
  
  const [salesView, setSalesView] = useState("Total Sales");
  const [selectedDateSalesAmt, setSelectedDateSalesAmt] = useState(0);
  const [onlineSalesAmt, setOnlineSalesAmt] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [userRole, setUserRole] = useState("master");

  const salesDataRef = useRef([]);
  const purchaseDataRef = useRef([]);

  useEffect(() => {
    generateReport();
  }, [fromDate, toDate, currentMode]); 

  useEffect(() => {
    const loadShopAndMode = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const savedMode = (await AsyncStorage.getItem("app_mode")) || "local";
      setCurrentMode(savedMode);

      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        setShopName(snap.data().shopName || "MY SHOP");
      }

      const logo = await AsyncStorage.getItem(`shopLogo_${user.uid}`);
      if (logo) {
        setShopLogo(logo);
      }
    };
    loadShopAndMode();
  }, []);

  useEffect(() => {
  const checkRole = async () => {
    const session = await getSession();
    if (session?.role) setUserRole(session.role);
  };
  checkRole();
}, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const salesRef = collection(db, "users", user.uid, "sales");
    const purchaseCollection = currentMode === "global" ? "global_invoices" : "invoices";
    const purchaseRef = collection(db, "users", user.uid, purchaseCollection);

    let salesData = [];
    let purchaseData = [];

    const buildJournal = () => {
      const map = {};
      const isTargetGlobal = currentMode === "global";

      purchaseData.forEach(bill => {
        (bill.items || []).forEach(item => {
          const name = (item.itemName || item.name || "Unknown Product").trim().toLowerCase();
          if (!map[name]) {
            map[name] = { 
              id: name, 
              itemName: name, 
              purchaseQty: 0, 
              salesQty: 0, 
              purchaseAmount: 0, 
              salesAmount: 0, 
              profit: 0,
              purchaseHistory: [], 
              salesHistory: []
            };
          }
          const qty = Number(item.qty || 0);
          const purchasePrice = Number(item.purchasePrice ?? item.price ?? 0);
          map[name].purchaseQty += qty;
          map[name].purchaseAmount += purchasePrice * qty;

          map[name].purchaseHistory.push({
            supplierName: bill.supplierName || bill.vendorName || "Unknown Supplier",
            qty: qty,
            price: purchasePrice,
            date: bill.createdAt?.seconds ? new Date(bill.createdAt.seconds * 1000).toLocaleDateString() : "N/A"
          });
        });
      });

      const filteredSalesRows = salesData.filter(s => (s.isGlobalMode || false) === isTargetGlobal);

      filteredSalesRows.forEach(bill => {
        (bill.items || []).forEach(item => {
          const name = (item.itemName || item.name || "Unknown Product").trim().toLowerCase();
          if (!map[name]) {
            map[name] = { 
              id: name, 
              itemName: name, 
              purchaseQty: 0, 
              salesQty: 0, 
              purchaseAmount: 0, 
              salesAmount: 0, 
              profit: 0,
              purchaseHistory: [],
              salesHistory: []
            };
          }
          const qty = Number(item.qty || 0);
          const salesPrice = Number(item.salesPrice ?? item.price ?? 0);
          const purchasePrice = Number(item.purchasePrice ?? 0);

          map[name].salesQty += qty;
          map[name].salesAmount += salesPrice * qty;
          map[name].profit += (salesPrice - purchasePrice) * qty;

          map[name].salesHistory.push({
            customerName: bill.customerName || "Customer",
            billNo: bill.billNo || bill.invoiceId || "N/A",
            qty: qty,
            price: salesPrice,
            date: bill.createdAt?.seconds ? new Date(bill.createdAt.seconds * 1000).toLocaleDateString() : "N/A"
          });
        });
      });

      const finalData = Object.values(map);
      finalData.sort((a, b) => b.salesAmount - a.salesAmount);
      setProducts(finalData);
      setLoading(false);
    };

    const unsubSales = onSnapshot(salesRef, (snapshot) => {
      salesData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      salesDataRef.current = salesData;
      buildJournal();
      generateReport();
    });

    const unsubPurchase = onSnapshot(purchaseRef, (snapshot) => {
      purchaseData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      purchaseDataRef.current = purchaseData;
      buildJournal();
      generateReport();
    });

    return () => {
      unsubSales();
      unsubPurchase();
    };
  }, [currentMode]);

  const generateReport = () => {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);

    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);

    const isTargetGlobal = currentMode === "global";

    const sales = salesDataRef.current.filter(item => {
      if (!item.createdAt?.seconds) return false;
      const d = new Date(item.createdAt.seconds * 1000);
      const modeMatch = (item.isGlobalMode || false) === isTargetGlobal;
      return d >= from && d <= to && modeMatch;
    });

    const purchases = purchaseDataRef.current.filter(item => {
      if (!item.createdAt?.seconds) return false;
      const d = new Date(item.createdAt.seconds * 1000);
      return d >= from && d <= to;
    });

    const salesTotal = sales.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const purchaseTotal = purchases.reduce((sum, item) => sum + Number(item.total || 0), 0);

    const onlineSalesSum = sales
      .filter(item => {
        const billNo = String(item.billNo || item.invoiceId || "");
        return billNo.startsWith("KADAI-") || billNo.startsWith("ONL-") || item.paymentMode === "ONLINE";
      })
      .reduce((sum, item) => sum + Number(item.total || 0), 0);

    const map = {};

    purchases.forEach(bill => {
      (bill.items || []).forEach(item => {
        const name = item.itemName || item.name || "Unknown Product";
        if (!map[name]) {
          map[name] = { 
            itemName: name, 
            purchaseQty: 0, 
            salesQty: 0, 
            purchaseAmount: 0, 
            salesAmount: 0, 
            profit: 0,
            purchaseHistory: [], 
            salesHistory: [] 
          };
        }
        const qty = Number(item.qty || 0);
        const purchasePrice = Number(item.purchasePrice ?? item.price ?? 0);
        map[name].purchaseQty += qty;
        map[name].purchaseAmount += qty * purchasePrice;
        
        map[name].purchaseHistory.push({
          supplierName: bill.supplierName || bill.vendorName || "Unknown Supplier",
          qty: qty,
          price: purchasePrice,
          date: new Date(bill.createdAt.seconds * 1000).toLocaleDateString()
        });
      });
    });

    sales.forEach(bill => {
      (bill.items || []).forEach(item => {
        const name = item.itemName || item.name || "Unknown Product";
        if (!map[name]) {
          map[name] = { 
            itemName: name, 
            purchaseQty: 0, 
            salesQty: 0, 
            purchaseAmount: 0, 
            salesAmount: 0, 
            profit: 0,
            purchaseHistory: [], 
            salesHistory: [] 
          };
        }
        const qty = Number(item.qty || 0);
        const salesPrice = Number(item.salesPrice ?? item.price ?? 0);
        const purchasePrice = Number(item.purchasePrice ?? 0);

        map[name].salesQty += qty;
        map[name].salesAmount += qty * salesPrice;
        map[name].profit += (salesPrice - purchasePrice) * qty;

        map[name].salesHistory.push({
          customerName: bill.customerName || "Customer",
          billNo: bill.billNo || bill.invoiceId || "N/A",
          qty: qty,
          price: salesPrice,
          date: new Date(bill.createdAt.seconds * 1000).toLocaleDateString()
        });
      });
    });

    setFilteredProducts(Object.values(map));
    setFilteredSales(salesTotal);
    setFilteredPurchase(purchaseTotal);
    setFilteredProfit(salesTotal - purchaseTotal);
    setSelectedDateSalesAmt(salesTotal); 
    setOnlineSalesAmt(onlineSalesSum);  
  };

  const toggleSalesView = () => {
    if (salesView === "Total Sales") setSalesView("Selected Sales");
    else if (salesView === "Selected Sales") setSalesView("Online Sales");
    else setSalesView("Total Sales");
  };

  const displaySalesVal = salesView === "Online Sales" ? onlineSalesAmt : salesView === "Selected Sales" ? selectedDateSalesAmt : filteredSales;

  const printSingleProductReport = async (product) => {
    const pHistoryHtml = product.purchaseHistory.map(h => `
      <tr>
        <td>${h.date}</td>
        <td>${h.supplierName}</td>
        <td>${h.qty}</td>
        <td>₹${h.price.toFixed(2)}</td>
      </tr>
    `).join("");

    const sHistoryHtml = product.salesHistory.map(h => `
      <tr>
        <td>${h.date}</td>
        <td>${h.customerName} (Bill: ${h.billNo})</td>
        <td>${h.qty}</td>
        <td>₹${h.price.toFixed(2)}</td>
      </tr>
    `).join("");

    const html = `
      <html>
      <body style="font-family:Arial;padding:20px;">
        <h2>${shopName} - Product Report</h2>
        <hr/>
        <h3>Product: ${product.itemName.toUpperCase()}</h3>
        <p>Period: ${fromDate.toLocaleDateString()} to ${toDate.toLocaleDateString()}</p>
        
        <h4>Purchase Summary</h4>
        <p>Total Qty: ${product.purchaseQty} | Total Amount: ₹${product.purchaseAmount.toFixed(2)}</p>
        <table border="1" cellpadding="6" cellspacing="0" width="100%" style="border-collapse:collapse;">
          <tr style="background:#f3f4f6;">
            <td>Date</td><td>Supplier</td><td>Qty</td><td>Price</td>
          </tr>
          ${pHistoryHtml || '<tr><td colspan="4">No Purchase Data</td></tr>'}
        </table>

        <h4>Sales Summary</h4>
        <p>Total Qty: ${product.salesQty} | Total Amount: ₹${product.salesAmount.toFixed(2)} | Profit: ₹${product.profit.toFixed(2)}</p>
        <table border="1" cellpadding="6" cellspacing="0" width="100%" style="border-collapse:collapse;">
          <tr style="background:#f3f4f6;">
            <td>Date</td><td>Customer / Bill</td><td>Qty</td><td>Price</td>
          </tr>
          ${sHistoryHtml || '<tr><td colspan="4">No Sales Data</td></tr>'}
        </table>
      </body>
      </html>
    `;
    await RNPrint.print({ html });
  };

  const printReport = async () => {
    let logoHtml = "";
    try {
      if (shopLogo) {
        const base64 = await RNFS.readFile(shopLogo.replace("file://", ""), "base64");
        logoHtml = `<img src="data:image/png;base64,${base64}" style="width:60px;height:60px;border-radius:10px;margin-right:15px;"/>`;
      }
    } catch (e) {
      console.log(e);
    }

    const productsHtml = filteredProducts.map(item => `
      <tr>
        <td>${item.itemName}</td>
        <td>${item.purchaseQty}</td>
        <td>₹${item.purchaseAmount.toFixed(2)}</td>
        <td>${item.salesQty}</td>
        <td>₹${item.salesAmount.toFixed(2)}</td>
        <td>₹${item.profit.toFixed(2)}</td>
      </tr>
    `).join("");

    const html = `
      <html>
      <body style="font-family:Arial;padding:20px;">
        <div style="display:flex;flex-direction:row;align-items:center;border-bottom:1px solid #ccc;padding-bottom:12px;">
          ${logoHtml}
          <div>
            <h2 style="margin:0;">${shopName}</h2>
            <div>Journal Entries (${currentMode.toUpperCase()} MODE)</div>
          </div>
        </div>
        <br/>
        <h3>From : ${fromDate.toDateString()}</h3>
        <h3>To : ${toDate.toDateString()}</h3>
        <br/>
        <h2>Total Sales : ₹${filteredSales.toFixed(0)}</h2>
        <h2 style="color: #c2410c;">Online Sales (Selected Date) : ₹${onlineSalesAmt.toFixed(0)}</h2>
        <h2>Total Purchase : ₹${filteredPurchase.toFixed(0)}</h2>
        <h2>Net Profit : ₹${filteredProfit.toFixed(0)}</h2>
        <br/><br/>
        <h2>Product Wise Report</h2>
        <table border="1" cellpadding="8" cellspacing="0" width="100%" style="border-collapse:collapse;margin-top:10px;">
          <tr style="background:#f3f4f6;font-weight:bold;">
            <td>Product</td>
            <td>P Qty</td>
            <td>P Amount</td>
            <td>S Qty</td>
            <td>S Amount</td>
            <td>Profit</td>
          </tr>
          ${productsHtml}
        </table>
      </body>
      </html>
    `;

    await RNPrint.print({ html });
  };

  const handleProductPress = (item) => {
    setSelectedProduct(item);
    setModalVisible(true);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        
        {showFrom && (
          <DateTimePicker value={fromDate} mode="date" display="default" onChange={(event, date) => { setShowFrom(false); if (date) setFromDate(date); }} />
        )}

        {showTo && (
          <DateTimePicker value={toDate} mode="date" display="default" onChange={(event, date) => { setShowTo(false); if (date) setToDate(date); }} />
        )}

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={26} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>
            Journal ({currentMode === "global" ? "Global" : "Local"})
          </Text>
        </View>

        <View style={{ flexDirection: "row", paddingHorizontal: 20, marginTop: 10 }}>
          <TouchableOpacity onPress={() => setShowFrom(true)} style={[styles.datePickerBtn, { backgroundColor: theme.card }]}>
            <Text style={styles.datePickerLabel}>FROM DATE</Text>
            <Text style={[styles.datePickerValue, { color: theme.text }]}>{fromDate.toLocaleDateString()}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowTo(true)} style={[styles.datePickerBtn, { backgroundColor: theme.card }]}>
            <Text style={styles.datePickerLabel}>TO DATE</Text>
            <Text style={[styles.datePickerValue, { color: theme.text }]}>{toDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", paddingHorizontal: 20, marginTop: 18 }}>
          <TouchableOpacity 
            activeOpacity={0.85} 
            onPress={toggleSalesView} 
            style={[styles.statCardBox, { backgroundColor: darkMode ? "#064e3b" : "#eefbf0" }]}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Icon name="trending-up" size={24} color="#16a34a" />
              <Icon name="menu-down" size={20} color="#16a34a" />
            </View>
            <Text style={styles.statLabel}>
              {salesView === "Total Sales" ? "Total Sales" : salesView === "Selected Sales" ? "Selected Sales" : "Online Sales"} ▼
            </Text>
            <Text style={[styles.statAmount, { color: "#16a34a" }]}>
            {userRole === "employee" ? "🔒 Locked" : `₹${displaySalesVal.toFixed(0)}`}
            </Text>
          </TouchableOpacity>

          <View style={[styles.statCardBox, { backgroundColor: darkMode ? "#7f1d1d" : "#fff1f2", marginLeft: 12 }]}>
            <Icon name="shopping" size={24} color="#ef4444" />
            <Text style={styles.statLabel}>Total Purchase</Text>
            <Text style={[styles.statAmount, { color: "#ef4444" }]}>
             {userRole === "employee" ? "🔒 Locked" : `₹${filteredPurchase.toFixed(0)}`}
            </Text>
          </View>
        </View>

        <View style={styles.profitCard}>
          <Text style={{ color: "#e0e7ff", fontSize: 14 }}>Net Profit</Text>
          <Text style={{ color: "#fff", fontSize: 34, fontWeight: "bold", marginTop: 8 }}>
           {userRole === "employee" ? "🔒 Locked" : `₹${filteredProfit.toFixed(0)}`}
          </Text>
        </View>

        <View style={{ flexDirection: "row", paddingHorizontal: 20, marginTop: 12, marginBottom: 24 }}>
          <TouchableOpacity style={styles.printBtn} onPress={printReport}>
            <Text style={{ color: "#fff", fontWeight: "700" }}>Print Overall Report</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.tableHeaderRow, { backgroundColor: darkMode ? "#312e81" : "#f3f0ff" }]}>
          <Text style={{ flex: 2.5, fontWeight: "700", color: "#6366f1" }}>Product</Text>
          <Text style={{ flex: 1, textAlign: "right", fontWeight: "700", color: "#6366f1" }}>Purchase</Text>
          <Text style={{ flex: 1, textAlign: "right", fontWeight: "700", color: "#6366f1" }}>Sales</Text>
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 120 }}>
          {filteredProducts.map((item) => (
            <TouchableOpacity 
              key={item.itemName} 
              activeOpacity={0.7} 
              onPress={() => handleProductPress(item)} 
              style={[styles.listItemCard, { backgroundColor: theme.card, borderColor: darkMode ? "#334155" : "#eef2ff" }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text numberOfLines={1} style={[styles.productNameText, { color: theme.text }]}>
                  {item.itemName}
                </Text>
                <Text style={styles.purchaseAmountText}>
                 {userRole === "employee" ? "🔒" : `₹${item.purchaseAmount.toFixed(0)}`}
                </Text>
                <Text style={styles.salesAmountText}>
                {userRole === "employee" ? "🔒" : `₹${item.salesAmount.toFixed(0)}`}
               </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContainer, { backgroundColor: theme.card }]}>
            {selectedProduct && (
              <>
                <View style={[styles.modalHeader, { borderColor: darkMode ? "#334155" : "#f1f5f9" }]}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>{selectedProduct.itemName.toUpperCase()}</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Icon name="close" size={24} color="#ef4444" />
                  </TouchableOpacity>
                </View>

               <ScrollView showsVerticalScrollIndicator={false}>
  <View style={[styles.modalSummaryBox, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc" }]}>
    <Text style={[styles.summaryText, { color: theme.text }]}>Pur. Qty: <Text style={{fontWeight:'700'}}>{selectedProduct.purchaseQty}</Text> | Sales Qty: <Text style={{fontWeight:'700'}}>{selectedProduct.salesQty}</Text></Text>
    <Text style={[styles.summaryText, {marginTop: 4, color: theme.text }]}>Est. Profit: <Text style={{color: '#16a34a', fontWeight: '700'}}>₹{selectedProduct.profit.toFixed(0)}</Text></Text>
  </View>

  <Text style={styles.sectionTitle}>Supplier Purchase History</Text>
  {selectedProduct.purchaseHistory.length === 0 ? (
    <Text style={styles.emptyText}>No purchase data for this period.</Text>
  ) : (
    <View style={[styles.tableContainer, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: darkMode ? "#334155" : "#e2e8f0" }]}>
      <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: darkMode ? "#312e81" : "#eef2ff" }]}>
        <Text style={[styles.thText, {flex: 1.2}]}>Date / Supplier</Text>
        <Text style={[styles.thText, {flex: 0.6, textAlign: 'center'}]}>Price</Text>
        <Text style={[styles.thText, {flex: 0.5, textAlign: 'center'}]}>Pur.</Text>
        <Text style={[styles.thText, {flex: 0.5, textAlign: 'right'}]}>Total</Text>
      </View>
      {selectedProduct.purchaseHistory.map((p, idx) => (
        <View key={idx} style={[styles.tableRow, { borderColor: darkMode ? "#334155" : "#edf2f7" }]}>
          <View style={{flex: 1.2}}>
            <Text style={[styles.tdBold, { color: theme.text }]}>{p.supplierName}</Text>
            <Text style={styles.tdSub}>{p.date}</Text>
          </View>
          <Text style={[styles.tdText, {flex: 0.6, textAlign: 'center', color: theme.text }]}>₹{p.price.toFixed(0)}</Text>
          <Text style={[styles.tdText, {flex: 0.5, textAlign: 'center', color: theme.text }]}>{p.qty}</Text>
          <Text style={[styles.tdText, {flex: 0.5, textAlign: 'right', color: '#ef4444', fontWeight: '700'}]}>₹{(p.qty * p.price).toFixed(0)}</Text>
        </View>
      ))}
    </View>
  )}

  <Text style={styles.sectionTitle}>Sales History</Text>
  {selectedProduct.salesHistory.length === 0 ? (
    <Text style={styles.emptyText}>No sales data for this period.</Text>
  ) : (
    <View style={[styles.tableContainer, { backgroundColor: darkMode ? "#1e293b" : "#f8fafc", borderColor: darkMode ? "#334155" : "#e2e8f0" }]}>
      <View style={[styles.tableRow, styles.tableHeader, { backgroundColor: darkMode ? "#312e81" : "#eef2ff" }]}>
        <Text style={[styles.thText, {flex: 1.2}]}>Date / Customer</Text>
        <Text style={[styles.thText, {flex: 0.6, textAlign: 'center'}]}>Price</Text>
        <Text style={[styles.thText, {flex: 0.5, textAlign: 'center'}]}>Sales</Text>
        <Text style={[styles.thText, {flex: 0.5, textAlign: 'right'}]}>Total</Text>
      </View>
      {selectedProduct.salesHistory.map((s, idx) => (
        <View key={idx} style={[styles.tableRow, { borderColor: darkMode ? "#334155" : "#edf2f7" }]}>
          <View style={{flex: 1.2}}>
            <Text style={[styles.tdBold, { color: theme.text }]}>{s.customerName}</Text>
            <Text style={styles.tdSub}>{s.date} ({s.billNo})</Text>
          </View>
          <Text style={[styles.tdText, {flex: 0.6, textAlign: 'center', color: theme.text }]}>₹{s.price.toFixed(0)}</Text>
          <Text style={[styles.tdText, {flex: 0.5, textAlign: 'center', color: theme.text }]}>{s.qty}</Text>
          <Text style={[styles.tdText, {flex: 0.5, textAlign: 'right', color: '#16a34a', fontWeight: '700'}]}>₹{(s.qty * s.price).toFixed(0)}</Text>
        </View>
      ))}
    </View>
  )}
</ScrollView>

                <TouchableOpacity 
                  style={styles.modalPrintBtn} 
                  onPress={() => {
                    printSingleProductReport(selectedProduct);
                  }}
                >
                  <Icon name="printer" size={20} color="#fff" style={{marginRight: 8}} />
                  <Text style={{ color: "#fff", fontWeight: "700" }}>Print Product Report</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 15 },
  title: { fontSize: 24, fontWeight: "bold", marginLeft: 15, color: "#111827" },
  datePickerBtn: { flex: 1, backgroundColor: "#fff", height: 60, borderRadius: 16, paddingHorizontal: 16, justifyContent: "center", elevation: 2, marginRight: 6 },
  datePickerLabel: { fontSize: 11, color: "#64748b" },
  datePickerValue: { fontWeight: "700", color: "#111827", marginTop: 4 },
  statCardBox: { flex: 1, borderRadius: 18, padding: 16 },
  statLabel: { marginTop: 10, fontSize: 12, color: "#64748b", fontWeight: "600" },
  statAmount: { fontSize: 24, fontWeight: "bold", marginTop: 5 },
  profitCard: { backgroundColor: "#6366f1", marginHorizontal: 20, marginTop: 18, paddingVertical: 24, paddingHorizontal: 22, borderRadius: 24, shadowColor: "#6366f1", shadowOpacity: .25, shadowRadius: 12, elevation: 8 },
  printBtn: { flex: 1, backgroundColor: "#16a34a", height: 56, justifyContent: "center", alignItems: "center", borderRadius: 16 },
  tableHeaderRow: { flexDirection: "row", paddingHorizontal: 20, paddingVertical: 14, marginHorizontal: 20, marginBottom: 10, backgroundColor: "#f3f0ff", borderRadius: 14 },
  listItemCard: { backgroundColor: "#fff", borderRadius: 22, borderWidth: 1, borderColor: "#eef2ff", paddingVertical: 20, paddingHorizontal: 20, marginBottom: 14, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 12, elevation: 5 },
  productNameText: { flex: 2.8, fontSize: 15, fontWeight: "700", color: "#111827", paddingRight: 8 },
  purchaseAmountText: { flex: 1, textAlign: "right", fontSize: 15, fontWeight: "600", color: "#ef4444" },
  salesAmountText: { flex: 1, textAlign: "right", fontSize: 15, fontWeight: "700", color: "#16a34a" },
  
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContainer: { backgroundColor: "#fff", borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 24, maxHeight: "85%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottomWidth: 1, borderColor: "#f1f5f9", paddingBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: "bold", color: "#111827" },
  modalSummaryBox: { backgroundColor: "#f8fafc", padding: 14, borderRadius: 14, marginBottom: 15 },
  summaryText: { fontSize: 14, color: "#475569" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#6366f1", marginTop: 15, marginBottom: 10 },
  emptyText: { fontSize: 13, color: "#94a3b8", fontStyle: "italic", marginBottom: 10 },
  historyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderColor: "#f8fafc" },
  historyName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  historyDate: { fontSize: 11, color: "#64748b", marginTop: 2 },
  historyDetails: { fontSize: 14, fontWeight: "600", color: "#ef4444", textAlign: "right" },
  modalPrintBtn: { backgroundColor: "#6366f1", height: 54, borderRadius: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 25, marginBottom: 10 },
  tableContainer: { backgroundColor: "#f8fafc", borderRadius: 12, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: "#e2e8f0" },
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderColor: "#edf2f7" },
  tableHeader: { backgroundColor: "#eef2ff", borderRadius: 8, paddingVertical: 6, marginBottom: 4, borderBottomWidth: 0 },
  thText: { fontSize: 12, fontWeight: "700", color: "#4f46e5" },
  tdBold: { fontSize: 13, fontWeight: "600", color: "#111827" },
  tdSub: { fontSize: 10, color: "#64748b", marginTop: 1 },
  tdText: { fontSize: 13, color: "#334155" },
});