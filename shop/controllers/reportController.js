// reportController — use case "View sales report" (Admin, Accountant), DFD process 7
import * as orderService from "../services/orderService.js";
import { manilaDate } from "../utils/dates.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET /admin/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD  (default: this month so far)
export const sales = async (req, res, next) => {
  try {
    const today = manilaDate();
    let from = ISO.test(req.query.from || "") ? req.query.from : `${today.slice(0, 8)}01`;
    let to = ISO.test(req.query.to || "") ? req.query.to : today;
    if (from > to) [from, to] = [to, from];
    const report = await orderService.salesReport(from, to);
    res.render("admin-report", { title: "Sales report", nav: "report", report, printedOn: new Date() });
  } catch (err) {
    next(err);
  }
};
