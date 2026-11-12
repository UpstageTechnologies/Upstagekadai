describe("Restaurant Role-Based System (Waiter & Kitchen)", () => {
  describe("1. Staff Account Generation & Role Assignment", () => {
    const generatePassword = () => {
      const chars = "abcdefghjkmnpqrstuvwxyz23456789";
      let pwd = "";
      for (let i = 0; i < 6; i++) {
        pwd += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return pwd + "99";
    };

    const generateStaffId = (role, nextNum, year = 2026) => {
      let prefix = "EMP";
      if (role === "waiter") prefix = "WTR";
      else if (role === "kitchen") prefix = "KIT";
      return `${year}${prefix}${String(nextNum).padStart(3, "0")}`;
    };

    test("generates appropriate ID prefixes based on role", () => {
      expect(generateStaffId("waiter", 1)).toBe("2026WTR001");
      expect(generateStaffId("kitchen", 2)).toBe("2026KIT002");
      expect(generateStaffId("employee", 3)).toBe("2026EMP003");
    });

    test("generates secure alphanumeric passwords for staff", () => {
      const pwd1 = generatePassword();
      const pwd2 = generatePassword();
      expect(pwd1).toBeDefined();
      expect(pwd1.length).toBeGreaterThanOrEqual(8);
      expect(typeof pwd1).toBe("string");
      expect(pwd1.endsWith("99")).toBe(true);
    });

    test("allows owner to set custom password and custom login ID", () => {
      const customId = "WAITER-TABLE-A";
      const customPassword = "mySecretPassword123";

      const staffPayload = {
        staffId: customId,
        name: "Murugan",
        mobile: "9876543210",
        address: "Floor 1",
        password: customPassword,
        role: "waiter",
        masterUid: "master_restaurant_owner_1",
      };

      expect(staffPayload.staffId).toBe("WAITER-TABLE-A");
      expect(staffPayload.password).toBe("mySecretPassword123");
      expect(staffPayload.role).toBe("waiter");
    });

    test("blocks non-master users (waiter, kitchen, employee) from creating staff", () => {
      const isAccessAllowed = (role) => {
        if (role === "employee" || role === "waiter" || role === "kitchen") {
          return false;
        }
        return true;
      };

      expect(isAccessAllowed("waiter")).toBe(false);
      expect(isAccessAllowed("kitchen")).toBe(false);
      expect(isAccessAllowed("employee")).toBe(false);
      expect(isAccessAllowed("master")).toBe(true);
    });
  });

  describe("2. Staff Login Dynamic Routing", () => {
    const resolveTargetRoute = (role) => {
      if (role === "waiter") return "WaiterOrder";
      if (role === "kitchen") return "KitchenDisplay";
      return "Dashboard";
    };

    test("routes waiter to WaiterOrder screen", () => {
      expect(resolveTargetRoute("waiter")).toBe("WaiterOrder");
    });

    test("routes kitchen staff to KitchenDisplay screen", () => {
      expect(resolveTargetRoute("kitchen")).toBe("KitchenDisplay");
    });

    test("routes regular employee to Dashboard", () => {
      expect(resolveTargetRoute("employee")).toBe("Dashboard");
      expect(resolveTargetRoute(undefined)).toBe("Dashboard");
    });
  });

  describe("3. Waiter Role Constraints & Order Taking (KOT)", () => {
    test("waiter can assemble an order with portion and cooking notes", () => {
      const orderItems = [
        {
          foodId: "food_1",
          name: "Chicken Biryani",
          portion: "Full",
          price: 240,
          qty: 2,
          notes: "Extra raita, less spicy",
        },
        {
          foodId: "food_2",
          name: "Paneer Butter Masala",
          portion: "Standard",
          price: 180,
          qty: 1,
          notes: "No coriander",
        },
      ];

      const totalAmount = orderItems.reduce((acc, i) => acc + i.price * i.qty, 0);
      const totalItems = orderItems.reduce((acc, i) => acc + i.qty, 0);

      expect(totalAmount).toBe(660);
      expect(totalItems).toBe(3);
    });

    test("creates KOT payload for kitchen with status pending and NO payment information", () => {
      const kotPayload = {
        orderNumber: "KOT-1001",
        tableNo: "Table 4",
        waiterId: "2026WTR001",
        waiterName: "Ramesh",
        items: [
          {
            foodId: "dish_1",
            name: "Mutton Chukka",
            portion: "Half",
            price: 260,
            qty: 1,
            notes: "Well roasted",
          },
        ],
        orderNotes: "Serve quickly",
        status: "pending",
        totalAmount: 260,
        totalItems: 1,
      };

      expect(kotPayload.status).toBe("pending");
      expect(kotPayload.tableNo).toBe("Table 4");
      expect(kotPayload.items[0].notes).toBe("Well roasted");
      // STRICT CONSTRAINT: Waiter has NO payment fields
      expect(kotPayload).not.toHaveProperty("paymentMode");
      expect(kotPayload).not.toHaveProperty("isPaid");
      expect(kotPayload).not.toHaveProperty("cardDetails");
    });
  });

  describe("4. Kitchen Display System (KDS) & Dish Ready Workflow", () => {
    test("advances order status through kitchen lifecycle", () => {
      let order = {
        id: "order_123",
        tableNo: "Table 2",
        status: "pending",
      };

      // Chef starts cooking
      const startCooking = (o) => ({ ...o, status: "preparing", cookingStartedAt: new Date() });
      order = startCooking(order);
      expect(order.status).toBe("preparing");
      expect(order.cookingStartedAt).toBeDefined();

      // Chef marks Dish Ready
      const markDishReady = (o) => ({ ...o, status: "ready", dishReadyAt: new Date() });
      order = markDishReady(order);
      expect(order.status).toBe("ready");
      expect(order.dishReadyAt).toBeDefined();

      // Food served to customer table
      const markServed = (o) => ({ ...o, status: "served", servedAt: new Date() });
      order = markServed(order);
      expect(order.status).toBe("served");
      expect(order.servedAt).toBeDefined();
    });

    test("kitchen order card displays items without financial sales/purchase margins", () => {
      const kitchenCardView = (kot) => {
        // Kitchen only sees food items, quantity, portion, and cooking notes
        return kot.items.map((i) => ({
          name: i.name,
          portion: i.portion,
          qty: i.qty,
          notes: i.notes,
        }));
      };

      const rawKot = {
        orderNumber: "KOT-9999",
        tableNo: "Table 5",
        items: [
          {
            foodId: "f1",
            name: "Veg Fried Rice",
            portion: "Full",
            price: 150,
            purchasePrice: 60, // Internal cost
            qty: 2,
            notes: "Extra spring onion",
          },
        ],
      };

      const displayItems = kitchenCardView(rawKot);
      expect(displayItems[0]).toEqual({
        name: "Veg Fried Rice",
        portion: "Full",
        qty: 2,
        notes: "Extra spring onion",
      });
      expect(displayItems[0]).not.toHaveProperty("price");
      expect(displayItems[0]).not.toHaveProperty("purchasePrice");
    });

    test("filters kitchen orders correctly for active queue", () => {
      const allOrders = [
        { id: "1", status: "pending" },
        { id: "2", status: "preparing" },
        { id: "3", status: "ready" },
        { id: "4", status: "served" },
      ];

      const filterOrders = (orders, filter) => {
        if (filter === "active") {
          return orders.filter((o) => o.status === "pending" || o.status === "preparing");
        }
        return orders.filter((o) => o.status === filter);
      };

      expect(filterOrders(allOrders, "active")).toHaveLength(2);
      expect(filterOrders(allOrders, "ready")).toHaveLength(1);
      expect(filterOrders(allOrders, "served")).toHaveLength(1);
    });
  });

  describe("5. Cashier / Owner Table Billing Integration", () => {
    test("loads table order items into cashier billing register", () => {
      const tableOrder = {
        id: "kot_doc_456",
        tableNo: "Table 3",
        items: [
          {
            foodId: "f10",
            name: "Masala Dosa",
            portion: "Standard",
            price: 90,
            qty: 2,
            notes: "Crispy",
          },
          {
            foodId: "f11",
            name: "Filter Coffee",
            portion: "Standard",
            price: 40,
            qty: 2,
            notes: "Strong",
          },
        ],
      };

      const billingItems = tableOrder.items.map((item) => ({
        id: item.foodId,
        name: item.name,
        price: item.price,
        salesPrice: item.price,
        qty: item.qty,
      }));

      const subtotal = billingItems.reduce((acc, i) => acc + i.salesPrice * i.qty, 0);
      expect(billingItems).toHaveLength(2);
      expect(subtotal).toBe(260);
    });

    test("marks kitchen order as completed when owner collects payment", () => {
      let kitchenOrder = {
        id: "kot_doc_456",
        status: "served",
      };

      const completeBilling = (kot, billNo) => ({
        ...kot,
        status: "completed",
        billedAt: new Date(),
        billNo,
      });

      kitchenOrder = completeBilling(kitchenOrder, "BILL-2026-001");
      expect(kitchenOrder.status).toBe("completed");
      expect(kitchenOrder.billNo).toBe("BILL-2026-001");
    });
  });

  describe("6. Robust KOT Sending & Instant Delivery Sanitization", () => {
    test("sanitizes order items to prevent Firestore undefined / NaN errors", () => {
      const rawOrderItems = [
        {
          foodId: undefined,
          name: undefined,
          portion: undefined,
          price: "150",
          qty: undefined,
          notes: undefined,
        },
      ];

      const nowMs = 1700000000000;
      const sanitized = rawOrderItems.map((item, idx) => ({
        foodId: String(item.foodId || `dish_${idx}_${nowMs}`),
        name: String(item.name || "Dish"),
        portion: String(item.portion || "Standard"),
        price: Number(item.price) || 0,
        purchasePrice: Number(item.purchasePrice) || 0,
        qty: Math.max(1, Number(item.qty) || 1),
        notes: String(item.notes || "").trim(),
      }));

      expect(sanitized[0].foodId).toBe(`dish_0_${nowMs}`);
      expect(sanitized[0].name).toBe("Dish");
      expect(sanitized[0].portion).toBe("Standard");
      expect(sanitized[0].price).toBe(150);
      expect(sanitized[0].qty).toBe(1);
      expect(sanitized[0].notes).toBe("");
      // Guarantee no undefined fields exist
      Object.values(sanitized[0]).forEach((val) => {
        expect(val).not.toBeUndefined();
        expect(val).not.toBeNaN();
      });
    });

    test("sorts incoming KDS orders in memory using createdAtMs without index requirement", () => {
      const orderA = { id: "1", createdAtMs: 1000, tableNo: "Table 1" };
      const orderB = { id: "2", createdAtMs: 2500, tableNo: "Table 2" };
      const orderC = { id: "3", createdAtMs: 1800, tableNo: "Table 3" };

      const sorted = [orderA, orderB, orderC].sort((a, b) => {
        const timeA = a.createdAtMs || 0;
        const timeB = b.createdAtMs || 0;
        return timeB - timeA;
      });

      expect(sorted[0].id).toBe("2"); // Newest
      expect(sorted[1].id).toBe("3");
      expect(sorted[2].id).toBe("1"); // Oldest
    });

    test("auto-heals masterUid from alternative staff field names", () => {
      const staffDoc1 = { staffId: "W1", masterUid: "uid_123" };
      const staffDoc2 = { staffId: "W2", ownerUid: "uid_456" };
      const staffDoc3 = { staffId: "W3", userId: "uid_789" };

      const resolveUid = (doc) => doc.masterUid || doc.ownerUid || doc.userId || "";

      expect(resolveUid(staffDoc1)).toBe("uid_123");
      expect(resolveUid(staffDoc2)).toBe("uid_456");
      expect(resolveUid(staffDoc3)).toBe("uid_789");
    });
  });
});
