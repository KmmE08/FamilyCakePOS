import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, doc, setDoc, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';

// Global variables provided by the Canvas environment
// These will need to be replaced with actual Firebase config in a real project
// or passed as environment variables. For GitHub Pages, you might hardcode them
// or use a separate config file not committed to public repo.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Custom Alert/Modal Component ---
const CustomAlert = ({ message, onClose }) => {
    return (
        <div style={{
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '30px',
                borderRadius: '10px',
                boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
                textAlign: 'center',
                maxWidth: '400px',
                width: '90%'
            }}>
                <p style={{ marginBottom: '20px', fontSize: '1.1em' }}>{message}</p>
                <button
                    onClick={onClose}
                    style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '1em',
                        fontWeight: '600',
                        transition: 'all 0.3s ease'
                    }}
                >
                    OK
                </button>
            </div>
        </div>
    );
};

// Main App Component
const App = () => {
    // --- State Management ---
    const [user, setUser] = useState(null); // Firebase User object
    const [isAdmin, setIsAdmin] = useState(false); // Flag for admin role
    const [loadingAuth, setLoadingAuth] = useState(true); // Loading state for initial auth check
    const [activeTab, setActiveTab] = useState('pos'); // Current active tab

    // Data states
    const [products, setProducts] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [sales, setSales] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [heldCarts, setHeldCarts] = useState([]);

    // Form states for adding/editing
    const [productForm, setProductForm] = useState({ id: null, name: '', category: 'snacks', supplier: '', purchasePrice: '', bulkPrice: '', individualPrice: '', stock: '', searchTerm: '' });
    const [supplierForm, setSupplierForm] = useState({ id: null, name: '', contact: '', address: '', credit: '' });
    const [customerForm, setCustomerForm] = useState({ id: null, name: '', contact: '', address: '', credit: '' });
    const [expenseForm, setExpenseForm] = useState({ id: null, type: 'supplier_payment', description: '', amount: '', supplier: '' });

    // POS specific states
    const [cart, setCart] = useState([]);
    const [posCustomerType, setPosCustomerType] = useState('retail');
    const [posCustomer, setPosCustomer] = useState('');
    const [posPaymentMethod, setPosPaymentMethod] = useState('cash');
    const [cashReceived, setCashReceived] = useState('');
    const [cashAmount, setCashAmount] = useState('');
    const [creditAmount, setCreditAmount] = useState('');
    const [mobileAmount, setMobileAmount] = useState('');
    const [returnSaleId, setReturnSaleId] = useState('');
    const [returnReason, setReturnReason] = useState('');
    const [posProductSearchTerm, setPosProductSearchTerm] = useState(''); // State for POS product search

    // Report states
    const [reportType, setReportType] = useState('daily');
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
    const [reportOutput, setReportOutput] = useState('');

    // Alert/Modal state
    const [alertMessage, setAlertMessage] = useState(null);
    const [showReceiptPreview, setShowReceiptPreview] = useState(false);
    const [currentReceipt, setCurrentReceipt] = useState('');

    // Login states
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');
    const [loginError, setLoginError] = useState('');

    // --- Dashboard & Reporting Callbacks (Moved to top for initialization) ---
    const updateDashboardStats = useCallback(() => {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = new Date().toISOString().substring(0, 7);

        let todaySalesAmount = 0;
        let monthSalesAmount = 0;
        let totalProfitAmount = 0;

        sales.forEach(sale => {
            if (sale.timestamp && sale.timestamp.startsWith(today)) {
                todaySalesAmount += sale.totalAmount || 0;
            }
            if (sale.timestamp && sale.timestamp.startsWith(currentMonth)) {
                monthSalesAmount += sale.totalAmount || 0;
            }
            totalProfitAmount += sale.profit || 0;
        });

        const totalProductsCount = products.length;

        const totalProductsEl = document.getElementById('totalProducts');
        const todaySalesEl = document.getElementById('todaySales');
        const monthSalesEl = document.getElementById('monthSales');
        const totalProfitEl = document.getElementById('totalProfit');

        if (totalProductsEl) totalProductsEl.textContent = totalProductsCount;
        if (todaySalesEl) todaySalesEl.textContent = `${todaySalesAmount.toFixed(0)} MMK`;
        if (monthSalesEl) monthSalesEl.textContent = `${monthSalesAmount.toFixed(0)} MMK`;
        if (totalProfitEl) totalProfitEl.textContent = `${totalProfitAmount.toFixed(0)} MMK`;
    }, [products, sales]);


    const renderRecentActivities = useCallback(() => {
        let activities = [];

        sales.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5).forEach(sale => {
            activities.push({
                type: 'sale',
                timestamp: sale.timestamp,
                description: `Sale of ${sale.quantity} x ${sale.productName} to ${sale.customerName} for ${(sale.totalAmount || 0).toFixed(0)} MMK.`,
                isPositive: true
            });
        });

        expenses.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5).forEach(expense => {
            activities.push({
                type: 'expense',
                timestamp: expense.timestamp,
                description: `Expense (${expense.type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}) for ${expense.description} of ${(expense.amount || 0).toFixed(0)} MMK.`,
                isPositive: false
            });
        });

        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        return activities.slice(0, 10).map((activity, index) => (
            <div key={index} style={{
                background: activity.isPositive ? 'rgba(46, 204, 113, 0.1)' : 'rgba(231, 76, 60, 0.1)',
                borderLeft: activity.isPositive ? '5px solid #2ecc71' : '5px solid #e74c3c',
                padding: '10px',
                marginBottom: '8px',
                borderRadius: '5px'
            }}>
                <p style={{ fontWeight: 'bold' }}>{activity.description}</p>
                <small>{new Date(activity.timestamp).toLocaleString()}</small>
            </div>
        ));
    }, [sales, expenses]);


    const checkLowStock = useCallback(() => {
        const lowStockItemsDiv = document.getElementById('lowStockItems');
        const lowStockAlertsDiv = document.getElementById('lowStockAlerts');
        if (!lowStockItemsDiv || !lowStockAlertsDiv) return;

        lowStockItemsDiv.innerHTML = '';
        let lowStockCount = 0;
        const LOW_STOCK_THRESHOLD = 5;

        products.forEach(product => {
            if (product.stock <= LOW_STOCK_THRESHOLD) {
                const p = document.createElement('p');
                p.innerHTML = `- <strong>${product.name}</strong> is low: <strong>${product.stock}</strong> left!`;
                lowStockItemsDiv.appendChild(p);
                lowStockCount++;
            }
        });

        if (lowStockCount > 0) {
            lowStockAlertsDiv.style.display = 'block';
        } else {
            lowStockAlertsDiv.style.display = 'none';
        }
    }, [products]);
    // --- End Dashboard & Reporting Callbacks ---

    // --- Firebase Authentication Effect ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                // For simplicity, let's assume a specific email is admin
                // In a real app, you'd store roles in Firestore user profiles
                if (currentUser.email === 'admin@example.com') { // Replace with your desired admin email
                    setIsAdmin(true);
                } else {
                    setIsAdmin(false);
                }
            } else {
                setUser(null);
                setIsAdmin(false);
                // Attempt anonymous sign-in if no user and no initial token
                if (!initialAuthToken) {
                    try {
                        await signInAnonymously(auth);
                    } catch (error) {
                        console.error("Error signing in anonymously:", error);
                    }
                }
            }
            setLoadingAuth(false);
        });

        // Sign in with custom token if provided (Canvas environment)
        if (initialAuthToken) {
            signInWithCustomToken(auth, initialAuthToken)
                .then(() => console.log("Signed in with custom token."))
                .catch((error) => console.error("Error signing in with custom token:", error));
        }

        return () => unsubscribe(); // Cleanup subscription
    }, [initialAuthToken]);

    // --- Firestore Data Subscriptions (Real-time updates) ---
    useEffect(() => {
        if (!user) return; // Only subscribe if user is authenticated

        const userId = user.uid; // Use Firebase UID for user-specific data

        // Products (public data for all users)
        const productsColRef = collection(db, `artifacts/${appId}/public/data/products`);
        const unsubscribeProducts = onSnapshot(productsColRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setProducts(data);
        }, (error) => console.error("Error fetching products:", error));

        // Suppliers (public data)
        const suppliersColRef = collection(db, `artifacts/${appId}/public/data/suppliers`);
        const unsubscribeSuppliers = onSnapshot(suppliersColRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSuppliers(data);
        }, (error) => console.error("Error fetching suppliers:", error));

        // Customers (public data)
        const customersColRef = collection(db, `artifacts/${appId}/public/data/customers`);
        const unsubscribeCustomers = onSnapshot(customersColRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCustomers(data);
        }, (error) => console.error("Error fetching customers:", error));

        // Sales (public data)
        const salesColRef = collection(db, `artifacts/${appId}/public/data/sales`);
        const unsubscribeSales = onSnapshot(salesColRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSales(data);
        }, (error) => console.error("Error fetching sales:", error));

        // Expenses (public data)
        const expensesColRef = collection(db, `artifacts/${appId}/public/data/expenses`);
        const unsubscribeExpenses = onSnapshot(expensesColRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setExpenses(data);
        }, (error) => console.error("Error fetching expenses:", error));

        // Held Carts (user-specific private data)
        const heldCartsColRef = collection(db, `artifacts/${appId}/users/${userId}/heldCarts`);
        const unsubscribeHeldCarts = onSnapshot(heldCartsColRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setHeldCarts(data);
        }, (error) => console.error("Error fetching held carts:", error));

        // Cleanup subscriptions on unmount or user change
        return () => {
            unsubscribeProducts();
            unsubscribeSuppliers();
            unsubscribeCustomers();
            unsubscribeSales();
            unsubscribeExpenses();
            unsubscribeHeldCarts();
        };
    }, [user, db]); // Re-run if user or db instance changes

    // --- Initial Data Population / Refresh on Tab Change ---
    // This useEffect is now primarily for triggering re-renders based on data changes,
    // as the rendering logic is directly in JSX.
    useEffect(() => {
        if (!user) return; // Don't run if not authenticated

        updateDashboardStats();
        checkLowStock();
    }, [products, sales, user, updateDashboardStats, checkLowStock]);

    // --- Auth Handlers ---
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        try {
            await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
            // User will be set by onAuthStateChanged listener
        } catch (error) {
            setLoginError('Failed to log in. Check email and password.');
            console.error("Login error:", error);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            setLoginEmail('');
            setLoginPassword('');
            setLoginError('');
            setAlertMessage('Logged out successfully.');
            // Clear all local states after logout
            setProducts([]);
            setSuppliers([]);
            setCustomers([]);
            setSales([]);
            setExpenses([]);
            setHeldCarts([]);
            setCart([]);
            setActiveTab('pos'); // Go back to POS or login screen
        } catch (error) {
            setAlertMessage('Error logging out.');
            console.error("Logout error:", error);
        }
    };

    // --- Product Inventory Functions ---
    const addProduct = async () => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to add products.'); return; }
        const { name, category, supplier, purchasePrice, bulkPrice, individualPrice, stock } = productForm;

        if (name && category && supplier && !isNaN(parseFloat(purchasePrice)) && !isNaN(parseFloat(bulkPrice)) && !isNaN(parseFloat(individualPrice)) && !isNaN(parseInt(stock)) && parseInt(stock) >= 0) {
            try {
                await addDoc(collection(db, `artifacts/${appId}/public/data/products`), {
                    name,
                    category,
                    supplier,
                    purchasePrice: parseFloat(purchasePrice),
                    bulkPrice: parseFloat(bulkPrice),
                    individualPrice: parseFloat(individualPrice),
                    stock: parseInt(stock),
                    createdAt: new Date().toISOString()
                });
                setAlertMessage('Product added successfully!');
                setProductForm({ id: null, name: '', category: 'snacks', supplier: '', purchasePrice: '', bulkPrice: '', individualPrice: '', stock: '', searchTerm: '' });
            } catch (e) {
                setAlertMessage('Error adding product.');
                console.error("Error adding document: ", e);
            }
        } else {
            setAlertMessage('Please fill in all product fields correctly, ensuring numbers are valid and stock is non-negative.');
        }
    };

    const updateProduct = async () => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to edit products.'); return; }
        const { id, name, category, supplier, purchasePrice, bulkPrice, individualPrice, stock } = productForm;
        if (!id) {
            setAlertMessage('No product selected for update.');
            return;
        }
        if (name && category && supplier && !isNaN(parseFloat(purchasePrice)) && !isNaN(parseFloat(bulkPrice)) && !isNaN(parseFloat(individualPrice)) && !isNaN(parseInt(stock)) && parseInt(stock) >= 0) {
            try {
                await setDoc(doc(db, `artifacts/${appId}/public/data/products`, id), {
                    name,
                    category,
                    supplier,
                    purchasePrice: parseFloat(purchasePrice),
                    bulkPrice: parseFloat(bulkPrice),
                    individualPrice: parseFloat(individualPrice),
                    stock: parseInt(stock)
                }, { merge: true }); // Use merge to update existing fields
                setAlertMessage('Product updated successfully!');
                setProductForm({ id: null, name: '', category: 'snacks', supplier: '', purchasePrice: '', bulkPrice: '', individualPrice: '', stock: '', searchTerm: '' });
            } catch (e) {
                setAlertMessage('Error updating product.');
                console.error("Error updating document: ", e);
            }
        } else {
            setAlertMessage('Please fill in all product fields correctly, ensuring numbers are valid and stock is non-negative.');
        }
    };

    const deleteProduct = async (id) => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to delete products.'); return; }
        if (window.confirm('Are you sure you want to delete this product?')) {
            try {
                await deleteDoc(doc(db, `artifacts/${appId}/public/data/products`, id));
                setAlertMessage('Product deleted successfully!');
            } catch (e) {
                setAlertMessage('Error deleting product.');
                console.error("Error deleting document: ", e);
            }
        }
    };

    const editProductForm = (product) => {
        setProductForm({
            id: product.id,
            name: product.name,
            category: product.category,
            supplier: product.supplier,
            purchasePrice: product.purchasePrice,
            bulkPrice: product.bulkPrice,
            individualPrice: product.individualPrice,
            stock: product.stock,
            searchTerm: '' // Clear search term when editing
        });
    };

    // --- Supplier Management Functions ---
    const addSupplier = async () => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to add suppliers.'); return; }
        const { name, contact, address, credit } = supplierForm;
        if (name && contact && address && !isNaN(parseFloat(credit))) {
            try {
                await addDoc(collection(db, `artifacts/${appId}/public/data/suppliers`), {
                    name,
                    contact,
                    address,
                    credit: parseFloat(credit),
                    createdAt: new Date().toISOString()
                });
                setAlertMessage('Supplier added successfully!');
                setSupplierForm({ id: null, name: '', contact: '', address: '', credit: '' });
            } catch (e) {
                setAlertMessage('Error adding supplier.');
                console.error("Error adding document: ", e);
            }
        } else {
            setAlertMessage('Please fill in all supplier fields correctly.');
        }
    };

    const updateSupplier = async () => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to edit suppliers.'); return; }
        const { id, name, contact, address, credit } = supplierForm;
        if (!id) {
            setAlertMessage('No supplier selected for update.');
            return;
        }
        if (name && contact && address && !isNaN(parseFloat(credit))) {
            try {
                await setDoc(doc(db, `artifacts/${appId}/public/data/suppliers`, id), {
                    name,
                    contact,
                    address,
                    credit: parseFloat(credit)
                }, { merge: true });
                setAlertMessage('Supplier updated successfully!');
                setSupplierForm({ id: null, name: '', contact: '', address: '', credit: '' });
            } catch (e) {
                setAlertMessage('Error updating supplier.');
                console.error("Error updating document: ", e);
            }
        } else {
            setAlertMessage('Please fill in all supplier fields correctly.');
        }
    };

    const deleteSupplier = async (id) => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to delete suppliers.'); return; }
        if (window.confirm('Are you sure you want to delete this supplier?')) {
            try {
                await deleteDoc(doc(db, `artifacts/${appId}/public/data/suppliers`, id));
                setAlertMessage('Supplier deleted successfully!');
            } catch (e) {
                setAlertMessage('Error deleting supplier.');
                console.error("Error deleting document: ", e);
            }
        }
    };

    const editSupplierForm = (supplier) => {
        setSupplierForm({
            id: supplier.id,
            name: supplier.name,
            contact: supplier.contact,
            address: supplier.address,
            credit: supplier.credit
        });
    };

    // --- Customer Management Functions ---
    const addCustomer = async () => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to add customers.'); return; }
        const { name, contact, address, credit } = customerForm;
        if (name && contact && address && !isNaN(parseFloat(credit))) {
            try {
                await addDoc(collection(db, `artifacts/${appId}/public/data/customers`), {
                    name,
                    contact,
                    address,
                    credit: parseFloat(credit),
                    createdAt: new Date().toISOString()
                });
                setAlertMessage('Customer added successfully!');
                setCustomerForm({ id: null, name: '', contact: '', address: '', credit: '' });
            } catch (e) {
                setAlertMessage('Error adding customer.');
                console.error("Error adding document: ", e);
            }
        } else {
            setAlertMessage('Please fill in all customer fields correctly.');
        }
    };

    const updateCustomer = async () => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to edit customers.'); return; }
        const { id, name, contact, address, credit } = customerForm;
        if (!id) {
            setAlertMessage('No customer selected for update.');
            return;
        }
        if (name && contact && address && !isNaN(parseFloat(credit))) {
            try {
                await setDoc(doc(db, `artifacts/${appId}/public/data/customers`, id), {
                    name,
                    contact,
                    address,
                    credit: parseFloat(credit)
                }, { merge: true });
                setAlertMessage('Customer updated successfully!');
                setCustomerForm({ id: null, name: '', contact: '', address: '', credit: '' });
            } catch (e) {
                setAlertMessage('Error updating customer.');
                console.error("Error updating document: ", e);
            }
        } else {
            setAlertMessage('Please fill in all customer fields correctly.');
        }
    };

    const deleteCustomer = async (id) => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to delete customers.'); return; }
        if (window.confirm('Are you sure you want to delete this customer?')) {
            try {
                await deleteDoc(doc(db, `artifacts/${appId}/public/data/customers`, id));
                setAlertMessage('Customer deleted successfully!');
            } catch (e) {
                setAlertMessage('Error deleting customer.');
                console.error("Error deleting document: ", e);
            }
        }
    };

    const editCustomerForm = (customer) => {
        setCustomerForm({
            id: customer.id,
            name: customer.name,
            contact: customer.contact,
            address: customer.address,
            credit: customer.credit
        });
    };

    // --- POS System Logic ---
    const filteredPOSProducts = products.filter(product =>
        product.name.toLowerCase().includes(posProductSearchTerm.toLowerCase())
    );

    const mostSoldProducts = [...products].sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0)).slice(0, 8);

    const addProductToCart = (productId) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        const existingCartItem = cart.find(item => item.id === productId);
        if (existingCartItem) {
            if (existingCartItem.quantity < product.stock) {
                setCart(prevCart => prevCart.map(item =>
                    item.id === productId ? { ...item, quantity: item.quantity + 1 } : item
                ));
            } else {
                setAlertMessage(`Not enough ${product.name} in stock!`);
            }
        } else {
            if (product.stock > 0) {
                setCart(prevCart => [...prevCart, {
                    id: product.id,
                    name: product.name,
                    individualPrice: product.individualPrice,
                    bulkPrice: product.bulkPrice,
                    purchasePrice: product.purchasePrice,
                    quantity: 1
                }]);
            } else {
                setAlertMessage(`${product.name} is out of stock!`);
            }
        }
    };

    const changeCartItemQuantity = (productId, change) => {
        setCart(prevCart => {
            const itemIndex = prevCart.findIndex(item => item.id === productId);
            if (itemIndex > -1) {
                const productInStock = products.find(p => p.id === productId);
                if (!productInStock) return prevCart;

                const newCart = [...prevCart];
                if (change === 1) { // Increase
                    if (newCart[itemIndex].quantity < productInStock.stock) {
                        newCart[itemIndex].quantity++;
                    } else {
                        setAlertMessage(`Cannot add more ${productInStock.name}. Max stock reached.`);
                    }
                } else if (change === -1) { // Decrease
                    newCart[itemIndex].quantity--;
                    if (newCart[itemIndex].quantity <= 0) {
                        newCart.splice(itemIndex, 1);
                    }
                }
                return newCart;
            }
            return prevCart;
        });
    };

    const removeCartItem = (productId) => {
        setCart(prevCart => prevCart.filter(item => item.id !== productId));
    };

    const clearCart = () => {
        setCart([]);
        setCashReceived('');
        setCashAmount('');
        setCreditAmount('');
        setMobileAmount('');
        setPosPaymentMethod('cash');
        setPosCustomer('');
        setPosCustomerType('retail');
        setAlertMessage('Cart cleared.');
    };

    const updateCustomerInfo = useCallback(() => {
        const customerInfoDiv = document.getElementById('customerInfo');
        const customerCreditBalanceSpan = document.getElementById('customerCreditBalance');
        
        if (!customerInfoDiv || !customerCreditBalanceSpan) return;

        if (posCustomer) {
            const customer = customers.find(c => c.id == posCustomer);
            if (customer) {
                customerCreditBalanceSpan.textContent = `${(customer.credit || 0).toFixed(0)} MMK`;
                customerInfoDiv.style.display = 'block';
            }
        } else {
            customerInfoDiv.style.display = 'none';
        }
    }, [posCustomer, customers]);

    useEffect(() => {
        updateCustomerInfo();
    }, [posCustomer, customers, updateCustomerInfo]);


    const calculateChange = useCallback(() => {
        const cartTotalText = document.getElementById('cartTotal')?.textContent;
        const total = parseFloat(cartTotalText) || 0;
        const cashReceivedInput = document.getElementById('cashReceived');
        const changeAmountInput = document.getElementById('changeAmount');
        
        if (!cashReceivedInput || !changeAmountInput) return;

        if (posPaymentMethod === 'cash') {
            const received = parseFloat(cashReceived) || 0;
            const change = received - total;
            changeAmountInput.value = change >= 0 ? change.toFixed(0) : '0';
            cashReceivedInput.style.borderColor = received < total ? '#e74c3c' : '#e0e0e0';
        } else if (posPaymentMethod === 'split') {
            const cash = parseFloat(cashAmount) || 0;
            const credit = parseFloat(creditAmount) || 0;
            const mobile = parseFloat(mobileAmount) || 0;
            const paidTotal = cash + credit + mobile;
            const remaining = total - paidTotal;

            changeAmountInput.value = remaining <= 0 ? Math.abs(remaining).toFixed(0) : '0';
            // Update the cashReceived input to show the total paid amount in split mode
            if (cashReceivedInput) cashReceivedInput.value = paidTotal.toFixed(0); 

            // Highlight inputs if not enough
            if (paidTotal < total) {
                document.getElementById('cashAmount').style.borderColor = '#e74c3c';
                document.getElementById('creditAmount').style.borderColor = '#e74c3c';
                document.getElementById('mobileAmount').style.borderColor = '#e74c3c';
            } else {
                document.getElementById('cashAmount').style.borderColor = '#e0e0e0';
                document.getElementById('creditAmount').style.borderColor = '#e0e0e0';
                document.getElementById('mobileAmount').style.borderColor = '#e0e0e0';
            }
        } else { // Credit or Mobile Payment
            if (cashReceivedInput) cashReceivedInput.value = total.toFixed(0);
            if (changeAmountInput) changeAmountInput.value = '0';
            if (cashReceivedInput) cashReceivedInput.style.borderColor = '#e0e0e0';
        }
    }, [posPaymentMethod, cashReceived, cashAmount, creditAmount, mobileAmount, cart]); 

    useEffect(() => {
        calculateChange();
    }, [posPaymentMethod, cashReceived, cashAmount, creditAmount, mobileAmount, calculateChange]);

    const completeSale = async () => {
        if (cart.length === 0) {
            setAlertMessage('Cart is empty!');
            return;
        }

        const total = parseFloat(document.getElementById('cartTotal')?.textContent) || 0;
        let finalCashReceived = 0;
        let finalCreditPayment = 0;
        let finalMobilePayment = 0;
        let finalChange = 0;

        // Payment validation and amount assignment
        if (posPaymentMethod === 'cash') {
            finalCashReceived = parseFloat(cashReceived) || 0;
            if (finalCashReceived < total) {
                setAlertMessage('Insufficient cash received!');
                return;
            }
            finalChange = finalCashReceived - total;
        } else if (posPaymentMethod === 'split') {
            finalCashReceived = parseFloat(cashAmount) || 0;
            finalCreditPayment = parseFloat(creditAmount) || 0;
            finalMobilePayment = parseFloat(mobileAmount) || 0;
            if ((finalCashReceived + finalCreditPayment + finalMobilePayment) < total) {
                setAlertMessage('Split payment amounts do not cover total!');
                return;
            }
            finalChange = (finalCashReceived + finalCreditPayment + finalMobilePayment) - total;
        } else if (posPaymentMethod === 'credit') {
            finalCreditPayment = total;
            if (!posCustomer) {
                setAlertMessage('Cannot process credit payment for walk-in customer. Please select a customer.');
                return;
            }
        } else if (posPaymentMethod === 'mobile') {
            finalMobilePayment = total;
        }

        try {
            // Update product stock in Firestore
            for (const cartItem of cart) {
                const productRef = doc(db, `artifacts/${appId}/public/data/products`, cartItem.id);
                const product = products.find(p => p.id === cartItem.id);
                if (product) {
                    const newStock = (product.stock || 0) - cartItem.quantity;
                    const newSalesCount = (product.salesCount || 0) + cartItem.quantity;
                    await updateDoc(productRef, { stock: newStock, salesCount: newSalesCount });
                }
            }

            // Update customer credit if applicable
            if (posCustomer && (posPaymentMethod === 'credit' || (posPaymentMethod === 'split' && finalCreditPayment > 0))) {
                const customerRef = doc(db, `artifacts/${appId}/public/data/customers`, posCustomer);
                const customer = customers.find(c => c.id == posCustomer);
                if (customer) {
                    const newCredit = (customer.credit || 0) + finalCreditPayment; // Ensure credit is a number
                    await updateDoc(customerRef, { credit: newCredit });
                }
            }

            // Record sale in Firestore
            const saleDate = new Date();
            const sale = {
                timestamp: saleDate.toISOString(),
                products: JSON.parse(JSON.stringify(cart)), // Deep copy of cart items
                customerId: posCustomer || 'walk-in',
                customerName: posCustomer ? (customers.find(c => c.id == posCustomer)?.name || 'Unknown Customer') : 'Walk-in Customer',
                customerType: posCustomerType,
                totalAmount: total,
                profit: parseFloat(document.getElementById('cartProfit')?.textContent) || 0,
                paymentMethod: posPaymentMethod,
                cashReceived: finalCashReceived,
                creditPayment: finalCreditPayment,
                mobilePayment: finalMobilePayment,
                change: finalChange
            };
            await addDoc(collection(db, `artifacts/${appId}/public/data/sales`), sale);

            setAlertMessage('Sale completed successfully!');
            generateReceiptContent(sale); // Generate receipt content for modal
            setShowReceiptPreview(true); // Show receipt modal
            clearCart();
        } catch (e) {
            setAlertMessage('Error completing sale. Please try again.');
            console.error("Error completing sale:", e);
        }
    };

    const holdTransaction = async () => {
        if (cart.length === 0) {
            setAlertMessage('Cart is empty. Nothing to hold.');
            return;
        }
        if (!user) { // Should not happen if UI is correctly gated, but as a safeguard
            setAlertMessage('Please log in to hold transactions.');
            return;
        }

        try {
            const heldCart = {
                timestamp: new Date().toISOString(),
                cartItems: JSON.parse(JSON.stringify(cart)),
                customerName: posCustomer ? (customers.find(c => c.id == posCustomer)?.name || 'Unknown Customer') : 'Walk-in Customer',
                customerType: posCustomerType,
                customerId: posCustomer || null
            };
            await addDoc(collection(db, `artifacts/${appId}/users/${user.uid}/heldCarts`), heldCart);
            setAlertMessage('Transaction held successfully!');
            clearCart();
        } catch (e) {
            setAlertMessage('Error holding transaction.');
            console.error("Error holding transaction:", e);
        }
    };

    const resumeHeldTransaction = async (id) => {
        const held = heldCarts.find(h => h.id === id);
        if (!held) return;

        clearCart(); // Clear current cart first
        setCart(JSON.parse(JSON.stringify(held.cartItems))); // Restore cart items
        setPosCustomerType(held.customerType);
        setPosCustomer(held.customerId || ''); // Set customer ID for POS

        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/heldCarts`, id));
            setAlertMessage('Transaction resumed.');
        } catch (e) {
            setAlertMessage('Error resuming transaction.');
            console.error("Error deleting held cart:", e);
        }
    };

    const deleteHeldTransaction = async (id) => {
        if (!user) return;
        if (window.confirm('Are you sure you want to delete this held transaction? This cannot be undone.')) {
            try {
                await deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/heldCarts`, id));
                setAlertMessage('Held transaction deleted.');
            } catch (e) {
                setAlertMessage('Error deleting held transaction.');
                console.error("Error deleting held cart:", e);
            }
        }
    };

    const generateReceiptContent = (sale) => {
        const customer = sale.customerId && sale.customerId !== 'walk-in' ? customers.find(c => c.id == sale.customerId) : null;
        const receiptDate = new Date(sale.timestamp).toLocaleString();
        
        let receipt = `
-----------------------------------------
          Family Cake Receipt
-----------------------------------------
Date: ${receiptDate}
Customer: ${customer ? customer.name : 'Walk-in Customer'}
Customer Type: ${sale.customerType.toUpperCase()}
-----------------------------------------
Items:
`;
        sale.products.forEach(item => {
            const price = sale.customerType === 'wholesale' ? item.bulkPrice : item.individualPrice;
            receipt += `${item.name} x ${item.quantity} @ ${(price || 0).toFixed(0)} MMK = ${((item.quantity * price) || 0).toFixed(0)} MMK
`;
        });
        
        receipt += `
-----------------------------------------
Subtotal: ${(sale.totalAmount || 0).toFixed(0)} MMK
Total   : ${(sale.totalAmount || 0).toFixed(0)} MMK
Payment : ${sale.paymentMethod.toUpperCase()}
`;
        if (sale.paymentMethod === 'cash') {
            receipt += `Cash Recvd: ${(sale.cashReceived || 0).toFixed(0)} MMK
Change    : ${(sale.change || 0).toFixed(0)} MMK
`;
        } else if (sale.paymentMethod === 'split') {
            if (sale.cashReceived > 0) receipt += `Cash Paid: ${(sale.cashReceived || 0).toFixed(0)} MMK\n`;
            if (sale.creditPayment > 0) receipt += `Credit Paid: ${(sale.creditPayment || 0).toFixed(0)} MMK\n`;
            if (sale.mobilePayment > 0) receipt += `Mobile Paid: ${(sale.mobilePayment || 0).toFixed(0)} MMK\n`;
            if (sale.change > 0) receipt += `Change    : ${(sale.change || 0).toFixed(0)} MMK\n`;
        }
        
        receipt += `
Profit  : ${(sale.profit || 0).toFixed(0)} MMK
-----------------------------------------
          Thank You!
-----------------------------------------
        `;
        setCurrentReceipt(receipt);
    };

    const closeReceiptPreview = () => {
        setShowReceiptPreview(false);
        setCurrentReceipt('');
    };

    const printReceipt = () => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write('<pre>' + currentReceipt + '</pre>');
        printWindow.document.close();
        printWindow.print();
    };

    const processReturn = async () => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to process returns.'); return; }
        if (!returnSaleId) {
            setAlertMessage('Please select a sale to return.');
            return;
        }
        if (!returnReason) {
            setAlertMessage('Please provide a reason for the return.');
            return;
        }

        const saleToReturn = sales.find(s => s.id == returnSaleId);
        if (!saleToReturn) {
            setAlertMessage('Sale not found.');
            return;
        }

        if (window.confirm(`Are you sure you want to return this sale (Total: ${(saleToReturn.totalAmount || 0).toFixed(0)} MMK) for reason: "${returnReason}"?`)) {
            try {
                // Adjust product stock back in Firestore
                for (const item of saleToReturn.products) {
                    const productRef = doc(db, `artifacts/${appId}/public/data/products`, item.id);
                    const product = products.find(p => p.id === item.id);
                    if (product) {
                        await updateDoc(productRef, { stock: (product.stock || 0) + item.quantity });
                    }
                }

                // Record as an expense (refund) in Firestore
                const refundExpense = {
                    timestamp: new Date().toISOString(),
                    type: 'refund',
                    description: `Refund for sale ID ${saleToReturn.id} (${saleToReturn.customerName}) - Reason: ${returnReason}`,
                    amount: saleToReturn.totalAmount || 0,
                    supplier: 'N/A'
                };
                await addDoc(collection(db, `artifacts/${appId}/public/data/expenses`), refundExpense);
                
                setAlertMessage(`Sale ID ${returnSaleId} successfully processed for return. Amount ${(saleToReturn.totalAmount || 0).toFixed(0)} MMK recorded as an expense.`);
                setReturnSaleId('');
                setReturnReason('');
            } catch (e) {
                setAlertMessage('Error processing return.');
                console.error("Error processing return:", e);
            }
        }
    };

    // --- Sales Recording Functions (Manual Sales Tab) ---
    const recordSale = async () => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to record sales.'); return; }
        const saleProduct = document.getElementById('saleProduct')?.value;
        const saleCustomer = document.getElementById('saleCustomer')?.value;
        const saleType = document.getElementById('saleType')?.value;
        const saleQuantity = parseInt(document.getElementById('saleQuantity')?.value);
        const paymentMethod = document.getElementById('paymentMethod')?.value;

        if (!saleProduct || isNaN(saleQuantity) || saleQuantity <= 0) {
            setAlertMessage('Please select a product and enter a valid quantity for manual sale.');
            return;
        }

        const product = products.find(p => p.id == saleProduct);
        if (!product) {
            setAlertMessage('Selected product not found for manual sale.');
            return;
        }
        if (product.stock < saleQuantity) {
            setAlertMessage(`Not enough stock for ${product.name}. Available: ${product.stock}`);
            return;
        }

        const unitPrice = saleType === 'bulk' ? (product.bulkPrice || 0) : (product.individualPrice || 0);
        const totalAmount = unitPrice * saleQuantity;
        const profit = (unitPrice - (product.purchasePrice || 0)) * saleQuantity;

        let customerName = 'Walk-in Customer';
        let customerObj = null;
        if (saleCustomer) {
            customerObj = customers.find(c => c.id == saleCustomer);
            if (customerObj) {
                customerName = customerObj.name;
            }
        }

        try {
            // Update product stock in Firestore
            const productRef = doc(db, `artifacts/${appId}/public/data/products`, product.id);
            const newStock = (product.stock || 0) - saleQuantity;
            const newSalesCount = (product.salesCount || 0) + saleQuantity;
            await updateDoc(productRef, { stock: newStock, salesCount: newSalesCount });

            // Update customer credit if applicable
            if (customerObj && paymentMethod === 'credit') {
                const customerRef = doc(db, `artifacts/${appId}/public/data/customers`, customerObj.id);
                const newCredit = (customerObj.credit || 0) + totalAmount;
                await updateDoc(customerRef, { credit: newCredit });
            }

            // Record sale in Firestore
            const newSale = {
                timestamp: new Date().toISOString(),
                productName: product.name,
                productId: product.id, // Store productId for easier lookup
                customerId: saleCustomer || null,
                customerName: customerName,
                quantity: saleQuantity,
                unitPrice: unitPrice,
                totalAmount: totalAmount,
                profit: profit,
                paymentMethod: paymentMethod
            };
            await addDoc(collection(db, `artifacts/${appId}/public/data/sales`), newSale);

            setAlertMessage('Sale recorded successfully!');
            // Clear form
            document.getElementById('saleProduct').value = '';
            document.getElementById('saleCustomer').value = '';
            document.getElementById('saleQuantity').value = '';
            document.getElementById('salePrice').value = '';
            document.getElementById('saleTotal').value = '';
        } catch (e) {
            setAlertMessage('Error recording sale. Please try again.');
            console.error("Error recording sale:", e);
        }
    };

    const updateSalePriceAndTotal = useCallback(() => {
        const productId = document.getElementById('saleProduct')?.value;
        const saleType = document.getElementById('saleType')?.value;
        const quantity = parseInt(document.getElementById('saleQuantity')?.value) || 0;
        const salePriceInput = document.getElementById('salePrice');
        const saleTotalInput = document.getElementById('saleTotal');

        if (!salePriceInput || !saleTotalInput || !productId) {
            salePriceInput.value = '';
            saleTotalInput.value = '';
            return;
        }

        const product = products.find(p => p.id == productId);
        if (product) {
            const unitPrice = saleType === 'bulk' ? (product.bulkPrice || 0) : (product.individualPrice || 0);
            salePriceInput.value = unitPrice?.toFixed(0) || '0';
            saleTotalInput.value = (unitPrice * quantity)?.toFixed(0) || '0';
        }
    }, [products]);

    useEffect(() => {
        const saleProductSelect = document.getElementById('saleProduct');
        const saleTypeSelect = document.getElementById('saleType');
        const saleQuantityInput = document.getElementById('saleQuantity');

        if (saleProductSelect) saleProductSelect.addEventListener('change', updateSalePriceAndTotal);
        if (saleTypeSelect) saleTypeSelect.addEventListener('change', updateSalePriceAndTotal);
        if (saleQuantityInput) saleQuantityInput.addEventListener('input', updateSalePriceAndTotal);

        return () => {
            if (saleProductSelect) saleProductSelect.removeEventListener('change', updateSalePriceAndTotal);
            if (saleTypeSelect) saleTypeSelect.removeEventListener('change', updateSalePriceAndTotal);
            if (saleQuantityInput) saleQuantityInput.removeEventListener('input', updateSalePriceAndTotal);
        };
    }, [updateSalePriceAndTotal]);


    // --- Expense Tracking Functions ---
    const addExpense = async () => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to add expenses.'); return; }
        const { type, description, amount, supplier } = expenseForm;

        if (type && description && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0) {
            try {
                await addDoc(collection(db, `artifacts/${appId}/public/data/expenses`), {
                    timestamp: new Date().toISOString(),
                    type,
                    description,
                    amount: parseFloat(amount),
                    supplier: supplier || 'N/A'
                });
                setAlertMessage('Expense added successfully!');
                setExpenseForm({ id: null, type: 'supplier_payment', description: '', amount: '', supplier: '' });
            } catch (e) {
                setAlertMessage('Error adding expense.');
                console.error("Error adding document: ", e);
            }
        } else {
            setAlertMessage('Please fill in all expense fields correctly, ensuring amount is positive.');
        }
    };

    const deleteExpense = async (id) => {
        if (!isAdmin) { setAlertMessage('Admin privilege required to delete expenses.'); return; }
        if (window.confirm('Are you sure you want to delete this expense?')) {
            try {
                await deleteDoc(doc(db, `artifacts/${appId}/public/data/expenses`, id));
                setAlertMessage('Expense deleted successfully!');
            } catch (e) {
                setAlertMessage('Error deleting expense.');
                console.error("Error deleting document: ", e);
            }
        }
    };

    const generateReport = () => {
        let reportHtml = `<h3>${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`;

        if (reportType === 'daily') {
            const targetDate = reportDate || new Date().toISOString().split('T')[0];
            reportHtml += ` for ${targetDate}</h3>`;
            const dailySales = sales.filter(s => s.timestamp && s.timestamp.startsWith(targetDate));
            const dailyExpenses = expenses.filter(e => e.timestamp && e.timestamp.startsWith(targetDate));

            let totalSales = 0;
            let totalProfit = 0;
            dailySales.forEach(s => { totalSales += s.totalAmount || 0; totalProfit += s.profit || 0; });

            let totalExpenses = 0;
            dailyExpenses.forEach(e => totalExpenses += e.amount || 0);

            const netProfit = totalSales - totalExpenses;

            reportHtml += `
                <div class="stats-grid" style="margin-top: 20px;">
                    <div class="stat-card">
                        <div class="stat-value currency">${totalSales.toFixed(0)} MMK</div>
                        <div class="stat-label">Total Sales</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value currency">${totalExpenses.toFixed(0)} MMK</div>
                        <div class="stat-label">Total Expenses</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value currency">${netProfit.toFixed(0)} MMK</div>
                        <div class="stat-label">Net Profit</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value currency">${totalProfit.toFixed(0)} MMK</div>
                        <div class="stat-label">Gross Profit (from sales)</div>
                    </div>
                </div>
            `;

            reportHtml += `<h4>Sales Details:</h4>`;
            reportHtml += `<table class="data-table"><thead><tr><th>Time</th><th>Product</th><th>Qty</th><th>Total</th><th>Profit</th></tr></thead><tbody>`;
            dailySales.forEach(s => {
                reportHtml += `<tr><td>${new Date(s.timestamp).toLocaleTimeString()}</td><td>${s.productName}</td><td>${s.quantity}</td><td>${(s.totalAmount || 0).toFixed(0)} MMK</td><td>${(s.profit || 0).toFixed(0)} MMK</td></tr>`;
            });
            reportHtml += `</tbody></table>`;

            reportHtml += `<h4>Expense Details:</h4>`;
            reportHtml += `<table class="data-table"><thead><tr><th>Time</th><th>Type</th><th>Description</th><th>Amount</th></tr></thead><tbody>`;
            dailyExpenses.forEach(e => {
                reportHtml += `<tr><td>${new Date(e.timestamp).toLocaleTimeString()}</td><td>${e.type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}</td><td>${(e.description || 'N/A')}</td><td>${(e.amount || 0).toFixed(0)} MMK</td></tr>`;
            });
            reportHtml += `</tbody></table>`;

        } else if (reportType === 'monthly') {
            const targetMonth = reportDate ? reportDate.substring(0, 7) : new Date().toISOString().substring(0, 7);
            reportHtml += ` for ${targetMonth}</h3>`;
            const monthlySales = sales.filter(s => s.timestamp && s.timestamp.startsWith(targetMonth));
            const monthlyExpenses = expenses.filter(e => e.timestamp && e.timestamp.startsWith(targetMonth));

            let totalSales = 0;
            let totalProfit = 0;
            monthlySales.forEach(s => { totalSales += s.totalAmount || 0; totalProfit += s.profit || 0; });

            let totalExpenses = 0;
            monthlyExpenses.forEach(e => totalExpenses += e.amount || 0);

            const netProfit = totalSales - totalExpenses;

            reportHtml += `
                <div class="stats-grid" style="margin-top: 20px;">
                    <div class="stat-card">
                        <div class="stat-value currency">${totalSales.toFixed(0)} MMK</div>
                        <div class="stat-label">Total Sales</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value currency">${totalExpenses.toFixed(0)} MMK</div>
                        <div class="stat-label">Total Expenses</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value currency">${netProfit.toFixed(0)} MMK</div>
                        <div class="stat-label">Net Profit</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value currency">${totalProfit.toFixed(0)} MMK</div>
                        <div class="stat-label">Gross Profit (from sales)</div>
                    </div>
                </div>
            `;

            reportHtml += `<h4>Sales Summary by Product:</h4>`;
            const productSalesSummary = {};
            monthlySales.forEach(s => {
                if (!productSalesSummary[s.productName]) {
                    productSalesSummary[s.productName] = { quantity: 0, total: 0, profit: 0 };
                }
                productSalesSummary[s.productName].quantity += s.quantity;
                productSalesSummary[s.productName].total += s.totalAmount || 0;
                productSalesSummary[s.productName].profit += s.profit || 0;
            });
            reportHtml += `<table class="data-table"><thead><tr><th>Product</th><th>Qty Sold</th><th>Total Sales</th><th>Total Profit</th></tr></thead><tbody>`;
            for (const prodName in productSalesSummary) {
                reportHtml += `<tr><td>${prodName}</td><td>${productSalesSummary[prodName].quantity}</td><td>${productSalesSummary[prodName].total.toFixed(0)} MMK</td><td>${productSalesSummary[prodName].profit.toFixed(0)} MMK</td></tr>`;
            }
            reportHtml += `</tbody></table>`;

            reportHtml += `<h4>Expense Summary by Type:</h4>`;
            const expenseTypeSummary = {};
            monthlyExpenses.forEach(e => {
                const type = e.type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
                if (!expenseTypeSummary[type]) {
                    expenseTypeSummary[type] = 0;
                }
                expenseTypeSummary[type] += e.amount || 0;
            });
            reportHtml += `<table class="data-table"><thead><tr><th>Expense Type</th><th>Total Amount</th></tr></thead><tbody>`;
            for (const expType in expenseTypeSummary) {
                reportHtml += `<tr><td>${expType}</td><td>${expenseTypeSummary[expType].toFixed(0)} MMK</td></tr>`;
            }
            reportHtml += `</tbody></table>`;

        } else if (reportType === 'product') {
            reportHtml += ` (Performance)</h3>`;
            reportHtml += `<table class="data-table"><thead><tr><th>Product Name</th><th>Current Stock</th><th>Total Sales Quantity</th><th>Total Sales Revenue</th><th>Total Profit</th></tr></thead><tbody>`;
            products.forEach(product => {
                const productSales = sales.filter(s => s.productId === product.id); // Filter by productId
                let totalQtySold = 0;
                let totalRevenue = 0;
                let totalProductProfit = 0;
                productSales.forEach(s => {
                    totalQtySold += s.quantity;
                    totalRevenue += s.totalAmount || 0;
                    totalProductProfit += s.profit || 0;
                });
                reportHtml += `<tr><td>${product.name}</td><td>${product.stock}</td><td>${totalQtySold}</td><td>${totalRevenue.toFixed(0)} MMK</td><td>${totalProductProfit.toFixed(0)} MMK</td></tr>`;
            });
            reportHtml += `</tbody></table>`;
        } else if (reportType === 'profit') {
            reportHtml += ` Analysis</h3>`;
            let overallRevenue = 0;
            let overallCostOfGoodsSold = 0;
            sales.forEach(sale => {
                overallRevenue += sale.totalAmount || 0;
                sale.products.forEach(item => { // Iterate over products in the sale
                    overallCostOfGoodsSold += (item.purchasePrice || 0) * item.quantity;
                });
            });

            let overallExpenses = 0;
            expenses.forEach(expense => {
                overallExpenses += expense.amount || 0;
            });

            const grossProfit = overallRevenue - overallCostOfGoodsSold;
            const netProfit = grossProfit - overallExpenses;

            reportHtml += `
                <div class="stats-grid" style="margin-top: 20px;">
                    <div class="stat-card">
                        <div class="stat-value currency">${overallRevenue.toFixed(0)} MMK</div>
                        <div class="stat-label">Total Revenue</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value currency">${overallCostOfGoodsSold.toFixed(0)} MMK</div>
                        <div class="stat-label">Total Cost of Goods Sold</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value currency">${grossProfit.toFixed(0)} MMK</div>
                        <div class="stat-label">Gross Profit</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value currency">${overallExpenses.toFixed(0)} MMK</div>
                        <div class="stat-label">Total Operating Expenses</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value currency">${netProfit.toFixed(0)} MMK</div>
                        <div class="stat-label">Net Profit (Overall)</div>
                    </div>
                </div>
            `;
        }

        setReportOutput(reportHtml);
    };

    const downloadReport = (reportName) => {
        const reportContent = document.getElementById('reportOutput')?.innerText;
        if (!reportContent) {
            setAlertMessage('No report generated to download.');
            return;
        }

        const filename = `${reportName}_report_${new Date().toISOString().split('T')[0]}.txt`;
        const blob = new Blob([reportContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setAlertMessage('Report downloaded successfully!');
    };


    // --- Main Render Logic ---
    if (loadingAuth) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontSize: '1.5em', color: 'white' }}>
                Loading authentication...
            </div>
        );
    }

    if (!user) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <div style={{ background: 'white', padding: '40px', borderRadius: '15px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center', maxWidth: '400px', width: '90%' }}>
                    <h2 style={{ color: '#2c3e50', marginBottom: '20px' }}>Login to Family Cake 🍞</h2>
                    <form onSubmit={handleLogin}>
                        <div style={{ marginBottom: '15px' }}>
                            <input
                                type="email"
                                placeholder="Email (admin@example.com)"
                                value={loginEmail}
                                onChange={(e) => setLoginEmail(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                                required
                            />
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <input
                                type="password"
                                placeholder="Password (password123)"
                                value={loginPassword}
                                onChange={(e) => setLoginPassword(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd' }}
                                required
                            />
                        </div>
                        {loginError && <p style={{ color: '#e74c3c', marginBottom: '15px' }}>{loginError}</p>}
                        <button type="submit" className="btn" style={{ width: '100%' }}>Login</button>
                    </form>
                    <p style={{ marginTop: '20px', fontSize: '0.9em', color: '#7f8c8d' }}>
                        Hint: Use `admin@example.com` and `password123` for admin access.
                    </p>
                </div>
                {alertMessage && <CustomAlert message={alertMessage} onClose={() => setAlertMessage(null)} />}
            </div>
        );
    }

    return (
        <div className="container">
            <div className="header">
                <h1>Family Cake 🍞</h1>
                <p>POS and Finance System</p>
                {user && (
                    <div style={{ marginTop: '15px', fontSize: '0.9em', color: '#555' }}>
                        Logged in as: <strong>{user.email}</strong> ({isAdmin ? 'Admin' : 'User'})
                        <button className="btn" onClick={handleLogout} style={{ marginLeft: '15px', padding: '8px 15px', fontSize: '0.9em', background: '#e74c3c' }}>Logout</button>
                    </div>
                )}
            </div>

            <div className="tabs">
                <button className={`tab ${activeTab === 'pos' ? 'active' : ''}`} onClick={() => setActiveTab('pos')}>🛒 POS</button>
                <button className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</button>
                <button className={`tab ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>📦 Inventory</button>
                <button className={`tab ${activeTab === 'suppliers' ? 'active' : ''}`} onClick={() => setActiveTab('suppliers')}>🏪 Suppliers</button>
                <button className={`tab ${activeTab === 'customers' ? 'active' : ''}`} onClick={() => setActiveTab('customers')}>👥 Customers</button>
                <button className={`tab ${activeTab === 'sales' ? 'active' : ''}`} onClick={() => setActiveTab('sales')}>💰 Sales</button>
                <button className={`tab ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => setActiveTab('expenses')}>💸 Expenses</button>
                <button className={`tab ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}>📈 Reports</button>
            </div>

            {/* POS Tab */}
            <div id="pos" className={`tab-content ${activeTab === 'pos' ? 'active' : ''}`}>
                <h2>🛒 Point of Sale System</h2>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                    {/* Left Side - Product Selection */}
                    <div>
                        <h3>Product Selection</h3>
                        
                        {/* Quick Select Products */}
                        <div className="form-group">
                            <label>Quick Select (Most Sold)</label>
                            <div id="quickSelectProducts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '20px' }}>
                                {mostSoldProducts.map(product => (
                                    <button
                                        key={product.id}
                                        className="btn"
                                        style={{ fontSize: '0.9em', padding: '8px 12px' }}
                                        onClick={() => addProductToCart(product.id)}
                                    >
                                        {product.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        {/* Manual Product Selection */}
                        <div className="form-row">
                            <div className="form-group">
                                <label>Search Products</label>
                                <input type="text" id="posProductSearch" placeholder="Search products..." value={posProductSearchTerm} onChange={(e) => setPosProductSearchTerm(e.target.value)} autoComplete="off" />
                            </div>
                        </div>
                        
                        <div id="posProductList" style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '10px' }}>
                            {filteredPOSProducts.map(product => (
                                <div
                                    key={product.id}
                                    className="product-item"
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px', borderBottom: '1px dashed #eee', cursor: 'pointer' }}
                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onClick={() => addProductToCart(product.id)}
                                >
                                    <span>{product.name} ({product.stock} in stock)</span>
                                    <span>{(product.individualPrice || 0).toFixed(0)} MMK</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    {/* Right Side - Transaction Details */}
                    <div>
                        <h3>Current Transaction</h3>
                        
                        {/* Customer Selection */}
                        <div className="form-row">
                            <div className="form-group">
                                <label>Customer</label>
                                <select id="posCustomer" value={posCustomer} onChange={(e) => setPosCustomer(e.target.value)}>
                                    <option value="">Walk-in Customer</option>
                                    {customers.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Customer Type</label>
                                <select id="posCustomerType" value={posCustomerType} onChange={(e) => setPosCustomerType(e.target.value)}>
                                    <option value="retail">Retail</option>
                                    <option value="wholesale">Wholesale</option>
                                </select>
                            </div>
                        </div>
                        
                        {/* Customer Info Display */}
                        <div id="customerInfo" style={{ display: 'none', background: '#f8f9fa', padding: '10px', borderRadius: '5px', marginBottom: '15px' }}>
                            <strong>Customer Credit Balance: <span id="customerCreditBalance" className="currency">0 MMK</span></strong>
                        </div>
                        
                        {/* Cart */}
                        <div id="posCart" style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '15px', minHeight: '200px' }}>
                            <h4>Shopping Cart</h4>
                            <div id="cartItems">
                                {cart.length === 0 ? (
                                    <p style={{ color: '#999', textAlign: 'center' }}>No items in cart</p>
                                ) : (
                                    cart.map(item => {
                                        const price = posCustomerType === 'wholesale' ? (item.bulkPrice || 0) : (item.individualPrice || 0);
                                        const itemTotal = price * item.quantity;
                                        return (
                                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <span>{item.name} x {item.quantity}</span>
                                                <span>
                                                    {itemTotal.toFixed(0)} MMK
                                                    <button onClick={() => changeCartItemQuantity(item.id, -1)} style={{ marginLeft: '10px', background: '#f8d7da', border: 'none', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer' }}>-</button>
                                                    <button onClick={() => changeCartItemQuantity(item.id, 1)} style={{ background: '#d4edda', border: 'none', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer' }}>+</button>
                                                    <button onClick={() => removeCartItem(item.id)} style={{ background: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer' }}>x</button>
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                        
                        {/* Cart Totals */}
                        <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span>Subtotal:</span>
                                <span id="cartSubtotal" className="currency">
                                    {cart.reduce((acc, item) => acc + (posCustomerType === 'wholesale' ? (item.bulkPrice || 0) : (item.individualPrice || 0)) * item.quantity, 0).toFixed(0)} MMK
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontWeight: 'bold', fontSize: '1.2em' }}>
                                <span>Total:</span>
                                <span id="cartTotal" className="currency">
                                    {cart.reduce((acc, item) => acc + (posCustomerType === 'wholesale' ? (item.bulkPrice || 0) : (item.individualPrice || 0)) * item.quantity, 0).toFixed(0)} MMK
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#27ae60', fontWeight: 'bold' }}>
                                <span>Profit:</span>
                                <span id="cartProfit" className="currency">
                                    {cart.reduce((acc, item) => acc + ((posCustomerType === 'wholesale' ? (item.bulkPrice || 0) : (item.individualPrice || 0)) - (item.purchasePrice || 0)) * item.quantity, 0).toFixed(0)} MMK
                                </span>
                            </div>
                        </div>
                        
                        {/* Payment Section */}
                        <div style={{ background: '#fff', border: '2px solid #667eea', borderRadius: '8px', padding: '15px', marginBottom: '15px' }}>
                            <h4>Payment</h4>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Payment Method</label>
                                    <select id="posPaymentMethod" value={posPaymentMethod} onChange={(e) => { setPosPaymentMethod(e.target.value); }}>
                                        <option value="cash">Cash</option>
                                        <option value="credit">Credit</option>
                                        <option value="mobile">Mobile Payment</option>
                                        <option value="split">Split Payment</option>
                                    </select>
                                </div>
                            </div>
                            
                            {/* Split Payment Options */}
                            {posPaymentMethod === 'split' && (
                                <div id="splitPaymentOptions">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Cash Amount (MMK)</label>
                                            <input type="number" id="cashAmount" placeholder="0" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label>Credit Amount (MMK)</label>
                                            <input type="number" id="creditAmount" placeholder="0" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label>Mobile Payment (MMK)</label>
                                            <input type="number" id="mobileAmount" placeholder="0" value={mobileAmount} onChange={(e) => setMobileAmount(e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {/* Cash Payment */}
                            {posPaymentMethod !== 'split' && (
                                <div id="cashPaymentSection">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Cash Received (MMK)</label>
                                            <input type="number" id="cashReceived" placeholder="0" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label>Change (MMK)</label>
                                            <input type="number" id="changeAmount" placeholder="0" readOnly />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Action Buttons */}
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                            <button className="btn btn-success" onClick={completeSale} style={{ flex: 1 }}>Complete Sale</button>
                            <button className="btn" onClick={holdTransaction} style={{ flex: 1 }}>Hold Transaction</button>
                            <button className="btn btn-danger" onClick={clearCart}>Clear Cart</button>
                        </div>
                        
                        {/* Held Transactions */}
                        {heldCarts.length > 0 && (
                            <div id="heldTransactions">
                                <h4>Held Transactions</h4>
                                <div id="heldTransactionsList">
                                    {heldCarts.map(held => (
                                        <div key={held.id} style={{ background: '#e9ecef', padding: '10px', borderRadius: '5px', marginBottom: '10px' }}>
                                            <p><strong>Held for {held.customerName} ({held.customerType})</strong> - {new Date(held.timestamp).toLocaleString()}</p>
                                            <p>{held.cartItems.map(item => `${item.name} x ${item.quantity}`).join(', ')}</p>
                                            <button className="btn btn-success" style={{ padding: '5px 10px', fontSize: '0.9em', marginTop: '5px' }} onClick={() => resumeHeldTransaction(held.id)}>Resume</button>
                                            <button className="btn btn-danger" style={{ padding: '5px 10px', fontSize: '0.9em', marginTop: '5px' }} onClick={() => deleteHeldTransaction(held.id)}>Delete</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {/* Low Stock Alerts */}
                        <div id="lowStockAlerts" style={{ display: 'none' }}>
                            <div className="alert alert-danger">
                                <strong>Low Stock Alert!</strong>
                                <div id="lowStockItems"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Receipt Preview */}
                {showReceiptPreview && (
                    <div id="receiptPreview" style={{ position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                        <div style={{ background: 'white', padding: '30px', borderRadius: '10px', maxWidth: '400px', width: '90%', boxShadow: '0 5px 15px rgba(0,0,0,0.3)', textAlign: 'left' }}>
                            <h3>Sales Receipt</h3>
                            <pre id="receiptContent" style={{ background: '#f8f8f8', padding: '15px', borderRadius: '5px', marginTop: '15px', maxHeight: '400px', overflowY: 'auto', fontSize: '14px' }}>{currentReceipt}</pre>
                            <div style={{ marginTop: '20px', textAlign: 'center' }}>
                                <button className="btn btn-success" onClick={printReceipt}>Print Receipt</button>
                                <button className="btn" onClick={closeReceiptPreview}>Close</button>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Returns Section */}
                <div style={{ marginTop: '30px', padding: '20px', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '8px' }}>
                    <h3>Returns & Refunds</h3>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Select Recent Sale</label>
                            <select id="returnSaleSelect" value={returnSaleId} onChange={(e) => setReturnSaleId(e.target.value)}>
                                <option value="">Select a recent sale</option>
                                {sales.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20).map(sale => (
                                    <option key={sale.id} value={sale.id}>{new Date(sale.timestamp).toLocaleString()} - {sale.customerName} - Total: {(sale.totalAmount || 0).toFixed(0)} MMK</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Return Reason</label>
                            <input type="text" id="returnReason" placeholder="Reason for return" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <button className="btn btn-danger" onClick={processReturn}>Process Return</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Dashboard Tab */}
            <div id="dashboard" className={`tab-content ${activeTab === 'dashboard' ? 'active' : ''}`}>
                <h2>📊 Business Dashboard</h2>
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-value" id="totalProducts">{products.length}</div>
                        <div className="stat-label">Total Products</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value currency" id="todaySales">0 MMK</div>
                        <div className="stat-label">Today's Sales</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value currency" id="monthSales">0 MMK</div>
                        <div className="stat-label">This Month's Sales</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value currency" id="totalProfit">0 MMK</div>
                        <div className="stat-label">Total Profit</div>
                    </div>
                </div>
                
                <h3>Recent Activities</h3>
                <div id="recentActivities">{renderRecentActivities()}</div>
            </div>

            {/* Inventory Tab */}
            <div id="inventory" className={`tab-content ${activeTab === 'inventory' ? 'active' : ''}`}>
                <h2>📦 Product Inventory</h2>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Product Name</label>
                        <input type="text" id="productName" placeholder="e.g., Local Poptarts" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Category</label>
                        <select id="productCategory" value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
                            <option value="snacks">Snacks</option>
                            <option value="sweets">Sweets</option>
                            <option value="beverages">Beverages</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Supplier</label>
                        <select id="productSupplier" value={productForm.supplier} onChange={(e) => setProductForm({ ...productForm, supplier: e.target.value })}>
                            <option value="">Select Supplier</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Purchase Price (MMK)</label>
                        <input type="number" id="purchasePrice" placeholder="0" value={productForm.purchasePrice} onChange={(e) => setProductForm({ ...productForm, purchasePrice: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Bulk Selling Price (MMK)</label>
                        <input type="number" id="bulkPrice" placeholder="0" value={productForm.bulkPrice} onChange={(e) => setProductForm({ ...productForm, bulkPrice: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Individual Selling Price (MMK)</label>
                        <input type="number" id="individualPrice" placeholder="0" value={productForm.individualPrice} onChange={(e) => setProductForm({ ...productForm, individualPrice: e.target.value })} />
                    </div>
                </div>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Initial Stock Quantity</label>
                        <input type="number" id="stockQuantity" placeholder="0" value={productForm.stock} onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })} />
                    </div>
                    <div className="form-group">
                        {isAdmin && (productForm.id ? (
                            <button className="btn" onClick={updateProduct}>Update Product</button>
                        ) : (
                            <button className="btn" onClick={addProduct}>Add Product</button>
                        ))}
                        {isAdmin && productForm.id && (
                            <button className="btn" onClick={() => setProductForm({ id: null, name: '', category: 'snacks', supplier: '', purchasePrice: '', bulkPrice: '', individualPrice: '', stock: '', searchTerm: '' })}>Clear Form</button>
                        )}
                    </div>
                </div>

                <div className="search-box">
                    <input type="text" id="productSearch" placeholder="Search products..." onKeyUp={(e) => setProductForm(prev => ({...prev, searchTerm: e.target.value}))} />
                </div>

                <table className="data-table" id="productsTable">
                    <thead>
                        <tr>
                            <th>Product Name</th>
                            <th>Category</th>
                            <th>Supplier</th>
                            <th>Stock</th>
                            <th>Purchase Price</th>
                            <th>Bulk Price</th>
                            <th>Individual Price</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="productsTableBody">
                        {products.filter(product =>
                            product.name.toLowerCase().includes((productForm.searchTerm || '').toLowerCase()) ||
                            product.category.toLowerCase().includes((productForm.searchTerm || '').toLowerCase()) ||
                            product.supplier.toLowerCase().includes((productForm.searchTerm || '').toLowerCase())
                        ).map(product => (
                            <tr key={product.id}>
                                <td>{product.name}</td>
                                <td>{product.category}</td>
                                <td>{product.supplier || 'N/A'}</td>
                                <td>{product.stock}</td>
                                <td>{(product.purchasePrice || 0).toFixed(0)} MMK</td>
                                <td>{(product.bulkPrice || 0).toFixed(0)} MMK</td>
                                <td>{(product.individualPrice || 0).toFixed(0)} MMK</td>
                                <td>
                                    {isAdmin && <button className="btn" onClick={() => editProductForm(product)}>Edit</button>}
                                    {isAdmin && <button className="btn btn-danger" onClick={() => deleteProduct(product.id)}>Delete</button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Suppliers Tab */}
            <div id="suppliers" className={`tab-content ${activeTab === 'suppliers' ? 'active' : ''}`}>
                <h2>🏪 Supplier Management</h2>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Supplier Name</label>
                        <input type="text" id="supplierName" placeholder="Supplier Name" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Contact Number</label>
                        <input type="text" id="supplierContact" placeholder="Phone Number" value={supplierForm.contact} onChange={(e) => setSupplierForm({ ...supplierForm, contact: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Address</label>
                        <input type="text" id="supplierAddress" placeholder="Address" value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} />
                    </div>
                </div>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Credit Balance (MMK)</label>
                        <input type="number" id="supplierCredit" placeholder="0" value={supplierForm.credit} onChange={(e) => setSupplierForm({ ...supplierForm, credit: e.target.value })} />
                    </div>
                    <div className="form-group">
                        {isAdmin && (supplierForm.id ? (
                            <button className="btn" onClick={updateSupplier}>Update Supplier</button>
                        ) : (
                            <button className="btn" onClick={addSupplier}>Add Supplier</button>
                        ))}
                        {isAdmin && supplierForm.id && (
                            <button className="btn" onClick={() => setSupplierForm({ id: null, name: '', contact: '', address: '', credit: '' })}>Clear Form</button>
                        )}
                    </div>
                </div>

                <table className="data-table" id="suppliersTable">
                    <thead>
                        <tr>
                            <th>Supplier Name</th>
                            <th>Contact</th>
                            <th>Address</th>
                            <th>Credit Balance</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="suppliersTableBody">
                        {suppliers.map(supplier => (
                            <tr key={supplier.id}>
                                <td>{supplier.name}</td>
                                <td>{supplier.contact}</td>
                                <td>{supplier.address}</td>
                                <td className="currency">{(supplier.credit || 0).toFixed(0)} MMK</td>
                                <td>
                                    {isAdmin && <button className="btn" onClick={() => editSupplierForm(supplier)}>Edit</button>}
                                    {isAdmin && <button className="btn btn-danger" onClick={() => deleteSupplier(supplier.id)}>Delete</button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Customers Tab */}
            <div id="customers" className={`tab-content ${activeTab === 'customers' ? 'active' : ''}`}>
                <h2>👥 Customer Management</h2>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Customer Name</label>
                        <input type="text" id="customerName" placeholder="Customer Name" value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Contact Number</label>
                        <input type="text" id="customerContact" placeholder="Phone Number" value={customerForm.contact} onChange={(e) => setCustomerForm({ ...customerForm, contact: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Address</label>
                        <input type="text" id="customerAddress" placeholder="Address" value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} />
                    </div>
                </div>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Credit Balance (MMK)</label>
                        <input type="number" id="customerCredit" placeholder="0" value={customerForm.credit} onChange={(e) => setCustomerForm({ ...customerForm, credit: e.target.value })} />
                    </div>
                    <div className="form-group">
                        {isAdmin && (customerForm.id ? (
                            <button className="btn" onClick={updateCustomer}>Update Customer</button>
                        ) : (
                            <button className="btn" onClick={addCustomer}>Add Customer</button>
                        ))}
                        {isAdmin && customerForm.id && (
                            <button className="btn" onClick={() => setCustomerForm({ id: null, name: '', contact: '', address: '', credit: '' })}>Clear Form</button>
                        )}
                    </div>
                </div>

                <table className="data-table" id="customersTable">
                    <thead>
                        <tr>
                            <th>Customer Name</th>
                            <th>Contact</th>
                            <th>Address</th>
                            <th>Credit Balance</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="customersTableBody">
                        {customers.map(customer => (
                            <tr key={customer.id}>
                                <td>{customer.name}</td>
                                <td>{customer.contact}</td>
                                <td>{customer.address}</td>
                                <td className="currency">{(customer.credit || 0).toFixed(0)} MMK</td>
                                <td>
                                    {isAdmin && <button className="btn" onClick={() => editCustomerForm(customer)}>Edit</button>}
                                    {isAdmin && <button className="btn btn-danger" onClick={() => deleteCustomer(customer.id)}>Delete</button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Sales Tab */}
            <div id="sales" className={`tab-content ${activeTab === 'sales' ? 'active' : ''}`}>
                <h2>💰 Sales Recording</h2>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Product</label>
                        <select id="saleProduct">
                            <option value="">Select Product</option>
                            {products.map(p => (
                                <option key={p.id} value={p.id}>{p.name} (Stock: {p.stock})</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Customer</label>
                        <select id="saleCustomer">
                            <option value="">Select Customer (Optional)</option>
                            {customers.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Sale Type</label>
                        <select id="saleType">
                            <option value="individual">Individual</option>
                            <option value="bulk">Bulk</option>
                        </select>
                    </div>
                </div>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Quantity</label>
                        <input type="number" id="saleQuantity" placeholder="0" />
                    </div>
                    <div className="form-group">
                        <label>Unit Price (MMK)</label>
                        <input type="number" id="salePrice" placeholder="0" readOnly />
                    </div>
                    <div className="form-group">
                        <label>Total Amount (MMK)</label>
                        <input type="number" id="saleTotal" placeholder="0" readOnly />
                    </div>
                </div>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Payment Method</label>
                        <select id="paymentMethod">
                            <option value="cash">Cash</option>
                            <option value="credit">Credit</option>
                        </select>
                    </div>
                    <div className="form-group">
                        {isAdmin && <button className="btn" onClick={recordSale}>Record Sale</button>}
                    </div>
                </div>

                <h3>Recent Sales</h3>
                <table className="data-table" id="salesTable">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Product</th>
                            <th>Customer</th>
                            <th>Quantity</th>
                            <th>Price</th>
                            <th>Total</th>
                            <th>Profit</th>
                            <th>Payment</th>
                        </tr>
                    </thead>
                    <tbody id="salesTableBody">
                        {sales.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(sale => (
                            <tr key={sale.id}>
                                <td>{new Date(sale.timestamp).toLocaleTimeString()}</td>
                                <td>{sale.productName}</td>
                                <td>{sale.customerName}</td>
                                <td>{sale.quantity}</td>
                                <td className="currency">{(sale.unitPrice || 0).toFixed(0)} MMK</td>
                                <td className="currency">{(sale.totalAmount || 0).toFixed(0)} MMK</td>
                                <td className="currency">{(sale.profit || 0).toFixed(0)} MMK</td>
                                <td>{sale.paymentMethod}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Expenses Tab */}
            <div id="expenses" className={`tab-content ${activeTab === 'expenses' ? 'active' : ''}`}>
                <h2>💸 Expense Tracking</h2>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Expense Type</label>
                        <select id="expenseType" value={expenseForm.type} onChange={(e) => setExpenseForm({ ...expenseForm, type: e.target.value })}>
                            <option value="supplier_payment">Supplier Payment</option>
                            <option value="rent">Rent</option>
                            <option value="utilities">Utilities</option>
                            <option value="transport">Transport</option>
                            <option value="supplies">Supplies (Receipt Paper, etc.)</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <input type="text" id="expenseDescription" placeholder="Expense description" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} />
                    </div>
                </div>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Amount (MMK)</label>
                        <input type="number" id="expenseAmount" placeholder="0" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label>Supplier (if applicable)</label>
                        <select id="expenseSupplier" value={expenseForm.supplier} onChange={(e) => setExpenseForm({ ...expenseForm, supplier: e.target.value })}>
                            <option value="">Select Supplier (Optional)</option>
                            {suppliers.map(s => (
                                <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        {isAdmin && <button className="btn" onClick={addExpense}>Add Expense</button>}
                        {isAdmin && expenseForm.id && ( // Assuming you might add edit expense later
                            <button className="btn" onClick={() => setExpenseForm({ id: null, type: 'supplier_payment', description: '', amount: '', supplier: '' })}>Clear Form</button>
                        )}
                    </div>
                </div>

                <h3>Recent Expenses</h3>
                <table className="data-table" id="expensesTable">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Amount</th>
                            <th>Supplier</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="expensesTableBody">
                        {expenses.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(expense => (
                            <tr key={expense.id}>
                                <td>{new Date(expense.timestamp).toLocaleTimeString()}</td>
                                <td>{expense.type.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())}</td>
                                <td>{expense.description}</td>
                                <td className="currency">{(expense.amount || 0).toFixed(0)} MMK</td>
                                <td>{expense.supplier}</td>
                                <td>
                                    {isAdmin && <button className="btn btn-danger" onClick={() => deleteExpense(expense.id)}>Delete</button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Reports Tab */}
            <div id="reports" className={`tab-content ${activeTab === 'reports' ? 'active' : ''}`}>
                <h2>📈 Reports & Analytics</h2>
                
                <div className="form-row">
                    <div className="form-group">
                        <label>Report Type</label>
                        <select id="reportType" value={reportType} onChange={(e) => setReportType(e.target.value)}>
                            <option value="daily">Daily Report</option>
                            <option value="monthly">Monthly Report</option>
                            <option value="product">Product Performance</option>
                            <option value="profit">Profit Analysis</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Date/Month</label>
                        <input type="date" id="reportDate" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                        {isAdmin && <button className="btn" onClick={generateReport}>Generate Report</button>}
                    </div>
                </div>

                <div id="reportOutput" dangerouslySetInnerHTML={{ __html: reportOutput }} style={{ marginTop: '20px', background: '#f8f9fa', padding: '20px', borderRadius: '8px', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                    {/* Report content will be displayed here */}
                </div>
                {reportOutput && isAdmin && (
                    <button className="btn" onClick={() => downloadReport(reportType)} style={{ marginTop: '10px' }}>Download Report</button>
                )}
            </div>
            {alertMessage && <CustomAlert message={alertMessage} onClose={() => setAlertMessage(null)} />}
        </div>
    );
};

export default App;

