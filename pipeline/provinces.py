"""xuribiao province slugs -> DataV province names (for county matching)."""
SLUG_PROVINCE = {
    "guangxi": "广西", "guangdongsheng": "广东", "yunnan": "云南", "sichuan": "四川",
    "hunansheng": "湖南", "guizhousheng": "贵州", "jiangxisheng": "江西", "fujiansheng": "福建",
    "gansusheng": "甘肃", "shandongsheng": "山东", "zhejiangsheng": "浙江", "henansheng": "河南",
    "jiangsusheng": "江苏", "heilongjiangsheng": "黑龙江", "hebei": "河北", "neimenggu": "内蒙古",
    "jilin": "吉林", "liaoning": "辽宁", "shanxi": "陕西", "shanxisheng": "山西", "hainan": "海南",
    "hubei": "湖北", "ningxia": "宁夏", "anhui": "安徽", "xinjiang": "新疆", "qinghai": "青海",
    "zhixiashi": None,   # 北京/天津/重庆: province = the city itself
}


def province_for(slug, city):
    p = SLUG_PROVINCE[slug]
    return p if p else (city or "").replace("市", "")
