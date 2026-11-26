export interface RawCensusCity {
  rank: number;
  name: string;
  slug: string;
  stateName: string;
  isCapital: boolean;
  census2011: number;
  census2001: number | null;
  changePct: string;
  lat: number;
  lon: number;
}

const RAW_CITY_LINES = `
Mumbai ‡ Maharashtra 12,442,373 11,978,450 +3.9% 19.0760°N 72.8777°E
Delhi ‡ Delhi 11,034,555 9,879,172 +11.7% 28.7041°N 77.1025°E
Bengaluru ‡ Karnataka 8,443,675 5,682,293 +48.6% 12.9716°N 77.5946°E
Hyderabad ‡ Telangana 6,993,262 5,496,960 +27.2% 17.3850°N 78.4867°E
Chennai ‡ Tamil Nadu 6,748,026 4,343,645 +55.4% 13.0827°N 80.2707°E
Ahmedabad ‡ Gujarat 5,577,940 4,470,006 +24.8% 23.0225°N 72.5714°E
Kolkata ‡ West Bengal 4,496,694 4,580,546 −1.8% 22.5726°N 88.3639°E
Surat Gujarat 4,467,797 2,788,126 +60.2% 21.1702°N 72.8311°E
Pune Maharashtra 3,124,458 2,538,473 +23.1% 18.5204°N 73.8567°E
Jaipur ‡ Rajasthan 3,046,163 2,322,575 +31.2% 26.9124°N 75.7873°E
Lucknow ‡ Uttar Pradesh 2,817,105 2,185,927 +28.9% 26.8467°N 80.9462°E
Kanpur Uttar Pradesh 2,765,348 2,551,337 +8.4% 26.4499°N 80.3319°E
Nagpur Maharashtra 2,405,665 2,052,066 +17.2% 21.1458°N 79.0882°E
Indore ‡ Madhya Pradesh 1,964,086 1,503,237 +30.7% 22.7196°N 75.8577°E
Thane Maharashtra 1,841,488 1,262,551 +45.9% 19.2183°N 72.9781°E
Bhopal ‡ Madhya Pradesh 1,798,218 1,458,416 +23.3% 23.2599°N 77.4126°E
Visakhapatnam ‡ Andhra Pradesh 1,728,128 1,345,938 +28.4% 17.6868°N 83.2185°E
Pimpri-Chinchwad Maharashtra 1,727,692 1,020,448 +69.3% 18.6279°N 73.8009°E
Patna ‡ Bihar 1,684,222 1,431,477 +17.7% 25.5941°N 85.1376°E
Vadodara Gujarat 1,670,806 1,338,244 +24.9% 22.3072°N 73.1812°E
Ghaziabad Uttar Pradesh 1,648,643 968,256 +70.3% 28.6692°N 77.4538°E
Ludhiana ‡ Punjab 1,618,879 1,398,467 +15.8% 30.9000°N 75.8573°E
Agra Uttar Pradesh 1,585,704 1,275,134 +24.4% 27.1767°N 78.0081°E
Nashik Maharashtra 1,486,053 1,077,236 +38.0% 20.0112°N 73.7909°E
Faridabad ‡ Haryana 1,414,050 1,055,938 +33.9% 28.4089°N 77.3178°E
Meerut Uttar Pradesh 1,305,429 1,068,772 +22.1% 28.9845°N 77.7064°E
Rajkot Gujarat 1,286,678 967,476 +33.0% 22.3039°N 70.8022°E
Kalyan-Dombivli Maharashtra 1,247,327 1,193,512 +4.5% 19.2358°N 73.1307°E
Vasai-Virar Maharashtra 1,222,390 518,601 +135.7% 19.3925°N 72.8328°E
Varanasi Uttar Pradesh 1,198,491 1,103,952 +8.6% 25.3176°N 82.9739°E
Srinagar ‡ Jammu and Kashmir 1,180,570 935,764 +26.2% 34.0836°N 74.7973°E
Chhatrapati Sambhajinagar Maharashtra 1,175,116 873,311 +34.6% 19.8762°N 75.3433°E
Dhanbad ‡ Jharkhand 1,162,472 1,031,523 +12.7% 23.7957°N 86.4304°E
Amritsar Punjab 1,132,383 979,801 +15.6% 31.6340°N 74.8723°E
Navi Mumbai Maharashtra 1,120,547 704,002 +59.2% 19.0330°N 73.0297°E
Prayagraj Uttar Pradesh 1,112,544 975,393 +14.1% 25.4358°N 81.8463°E
Howrah West Bengal 1,077,075 1,007,532 +6.9% 22.5958°N 88.2636°E
Ranchi ‡ Jharkhand 1,073,427 847,093 +26.7% 23.3441°N 85.3096°E
Jabalpur Madhya Pradesh 1,055,525 951,472 +10.9% 23.1815°N 79.9864°E
Gwalior Madhya Pradesh 1,054,420 827,026 +27.5% 26.2183°N 78.1828°E
Coimbatore Tamil Nadu 1,050,721 930,882 +12.9% 11.0168°N 76.9558°E
Vijayawada Andhra Pradesh 1,034,358 941,760 +9.8% 16.5062°N 80.6480°E
Jodhpur Rajasthan 1,033,756 856,525 +20.7% 26.2389°N 73.0243°E
Madurai Tamil Nadu 1,017,865 928,869 +9.6% 9.9252°N 78.1198°E
Raipur ‡ Chhattisgarh 1,010,433 707,469 +42.8% 21.2514°N 81.6296°E
Kota Rajasthan 1,001,694 703,150 +42.5% 25.2138°N 75.8648°E
Chandigarh ‡ Chandigarh 961,587 808,515 +18.9% 30.75°N 76.78°E
Guwahati ‡ Assam 957,352 809,895 +18.2% 26.183°N 91.733°E
Solapur Maharashtra 951,558 872,478 +9.1% 17.6800°N 75.9200°E
Hubli–Dharwad Karnataka 943,788 786,195 +20.0% 15.36167°N 75.08500°E
Bareilly Uttar Pradesh 903,668 344,543 +162.3% 28.167°N 78.383°E
Mysore Karnataka 893,062 755,379 +18.2% 12.26°N 76.6°E
Moradabad Uttar Pradesh 887,871 641,583 +38.4% 28.83°N 78.78°E
Gurgaon Haryana 876,969 173,542 +405.3% 28.456°N 77.029°E
Aligarh Uttar Pradesh 874,408 669,087 +30.7% 27.88°N 78.08°E
Jalandhar Punjab 862,886 706,043 +22.2% 31.326°N 75.576°E
Tiruchirappalli Tamil Nadu 847,387 752,066 +12.7% 10.80500°N 78.68556°E
Bhubaneswar ‡ Odisha 843,402 648,032 +30.1% 20.27°N 85.84°E
Salem Tamil Nadu 829,267 696,760 +19.0% 11.65°N 78.16°E
Mira-Bhayandar Maharashtra 809,378 520,388 +55.5% 19.29°N 72.85°E
Thiruvananthapuram ‡ Kerala 743,691 744,983 −0.2% 8.48750°N 76.95250°E
Bhiwandi Maharashtra 711,329 598,741 +18.8% 19.296664°N 73.063121°E
Saharanpur Uttar Pradesh 705,478 455,754 +54.8% 29.964°N 77.546°E
Gorakhpur Uttar Pradesh 673,446 622,701 +8.1% 26.7588°N 83.3697°E
Guntur Andhra Pradesh 647,508 514,461 +25.9% 16.20°N 80.27°E
Amravati Maharashtra 647,057 549,510 +17.8% 20.92583°N 77.76472°E
Bikaner Rajasthan 644,406 529,690 +21.7% 28.01667°N 73.31194°E
Noida (town) Uttar Pradesh 637,272 305,058 +108.9% 28.57°N 77.32°E
Jamshedpur Jharkhand 631,364 573,096 +10.2% 22.783°N 86.200°E
Bhilai Chhattisgarh 625,700 556,366 +12.5% 21.21°N 81.38°E
Warangal Telangana 615,998 530,636 +16.1% 18.0°N 79.58°E
Cuttack Odisha 610,189 534,654 +14.1% 20.52306°N 85.78806°E
Firozabad Uttar Pradesh 604,214 279,102 +116.5% 27.150°N 78.400°E
Kochi Kerala 602,046 596,473 +0.9% 9.967°N 76.217°E
Bhavnagar Gujarat 593,368 511,085 +16.1% 21.76°N 72.15°E
Dehradun ‡ Uttarakhand 569,578 426,674 +33.5% 30.318°N 78.029°E
Durgapur West Bengal 566,517 493,405 +14.8% 23.48°N 87.32°E
Asansol West Bengal 563,917 475,439 +18.6% 23.68°N 86.99°E
Nanded Waghala Maharashtra 550,439 430,733 +27.8% 19.15°N 77.30°E
Kolhapur Maharashtra 549,236 493,167 +11.4% 16.69167°N 74.23333°E
Ajmer Rajasthan 542,321 485,575 +11.7% 26.45°N 74.64°E
Kalaburagi Karnataka 533,587 422,569 +26.3% 17.3333°N 76.8333°E
Loni Uttar Pradesh 516,082 120,945 +326.7% 28.75°N 77.28°E
Ujjain Madhya Pradesh 515,215 430,427 +19.7% 23.167°N 75.767°E
Siliguri West Bengal 513,264 472,374 +8.7% 26.71°N 88.43°E
Ulhasnagar Maharashtra 506,098 473,731 +6.8% 19.22°N 73.15°E
Jhansi Uttar Pradesh 505,693 383,644 +31.8% 25.44862°N 78.56962°E
Sangli-Miraj & Kupwad Maharashtra 502,793 436,781 +15.1% 16.860446°N 74.565518°E
Jammu ‡ Jammu and Kashmir 502,197 369,959 +35.7% 32.73°N 74.87°E
Nellore Andhra Pradesh 499,575 378,428 +32.0% 14.43°N 79.97°E
Mangalore Karnataka 488,968 399,565 +22.4% 12.87°N 74.88°E
Belgaum Karnataka 488,157 399,653 +22.1% 15.850°N 74.500°E
Jamnagar Gujarat 479,920 443,518 +8.2% 22.47°N 70.07°E
Tirunelveli Tamil Nadu 473,637 411,831 +15.0% 8.73°N 77.7°E
Malegaon Maharashtra 471,312 409,403 +15.1% 18.42°N 77.53°E
Gaya Bihar 468,614 385,432 +21.6% 24.75°N 85.01°E
Ambattur Tamil Nadu 466,205 310,967 +49.9% 13.0983°N 80.1622°E
Jalgaon Maharashtra 460,228 368,618 +24.9% 20.997984°N 75.566711°E
Udaipur Rajasthan 451,100 389,438 +15.8% 24.525049°N 73.677116°E
Maheshtala West Bengal 448,317 385,266 +16.4% 22.5086210°N 88.2532182°E
Tiruppur Tamil Nadu 444,352 718,395 −38.1% 11.1075°N 77.3398°E
Davanagere Karnataka 434,971 364,523 +19.3% 14.4666°N 75.9242°E
Kozhikode Kerala 431,560 436,556 −1.1% 11.25°N 75.77°E
Kurnool Andhra Pradesh 430,214 269,122 +59.9% 15.8333°N 78.05°E
Akola Maharashtra 425,817 400,520 +6.3% 20.7°N 77.00°E
Rajpur Sonarpur West Bengal 424,368 336,707 +26.0% 22.4382026°N 88.4320450°E
Bokaro Jharkhand 414,820 393,805 +5.3% 23.67°N 86.15°E
Bellary Karnataka 410,445 316,766 +29.6% 15.100°N 76.917°E
Patiala Punjab 406,192 303,151 +34.0% 30.32°N 76.40°E
South Dumdum West Bengal 403,316 392,444 +2.8% 22.61°N 88.40°E
Gopalpur West Bengal 400,146 271,811 +47.2% 22.62°N 88.44°E
Agartala ‡ Tripura 400,004 271,811 +47.2% 23.833°N 91.267°E
Bhagalpur Bihar 398,138 340,767 +16.8% 25.250°N 87.000°E
Muzaffarnagar Uttar Pradesh 392,768 316,729 +24.0% 29.472332°N 77.708874°E
Bhatpara West Bengal 383,762 442,385 −13.3% 22.87°N 88.41°E
Latur Maharashtra 382,940 299,985 +27.7% 18.40°N 76.56°E
Panihati West Bengal 377,347 348,438 +8.3% 22.69°N 88.37°E
Dhule Maharashtra 375,559 341,755 +9.9% 20.89972°N 74.76972°E
Rohtak Haryana 374,292 286,807 +30.5% 28.8909°N 76.5796°E
Korba Chhattisgarh 363,390 315,690 +15.1% 22.35°N 82.68°E
Bhilwara Rajasthan 359,483 280,128 +28.3% 25.35°N 74.63°E
Berhampur Odisha 356,598 307,792 +15.9% 19.32°N 84.78°E
Muzaffarpur Bihar 354,462 305,525 +16.0% 26.0°N 85.45°E
Ahilyanagar Maharashtra 350,859 307,615 +14.1% 19.08°N 74.73°E
Mathura Uttar Pradesh 349,909 302,770 +15.6% 27.28°N 77.41°E
Kollam Kerala 348,657 361,560 −3.6% 8.88°N 76.60°E
Avadi Tamil Nadu 345,996 229,403 +50.3% 13.12°N 80.1°E
Kadapa Andhra Pradesh 343,054 125,725 +172.9% 14.47°N 78.82°E
Rajamahendravaram Andhra Pradesh 341,831 315,251 +8.4% 16.98°N 81.78°E
Bilaspur Chhattisgarh 331,030 274,917 +20.4% 22.09°N 82.15°E
Kamarhati West Bengal 330,211 314,507 +5.0% 22.67°N 88.37°E
Shahjahanpur Uttar Pradesh 329,736 296,662 +11.1% 27.88°N 79.91°E
Bijapur Karnataka 327,427 228,175 +43.5% 16.83°N 75.7°E
Rampur Uttar Pradesh 325,313 281,494 +15.6% 28.8°N 79.0°E
Shivamogga Karnataka 322,650 274,352 +17.6% 13.933°N 75.567°E
Chandrapur Maharashtra 320,379 289,450 +10.7% 19.950°N 79.297°E
Junagadh Gujarat 319,462 168,686 +89.4% 21.520°N 70.463°E
Thrissur Kerala 315,957 317,526 −0.5% 10.52°N 76.21°E
Alwar Rajasthan 315,379 260,593 +21.0% 27.34°N 76.38°E
Bardhaman West Bengal 314,265 285,602 +10.0% 23.233°N 87.867°E
Kulti West Bengal 313,809 289,903 +8.2% 23.73°N 86.85°E
Kakinada Andhra Pradesh 312,538 296,329 +5.5% 16.93°N 82.22°E
Nizamabad Telangana 311,152 288,722 +7.8% 18.672°N 78.094°E
Parbhani Maharashtra 307,170 259,329 +18.4% 19.27°N 76.78°E
Tumkur Karnataka 302,143 248,929 +21.4% 13.34°N 77.1°E
Hisar Haryana 301,383 — — 29.09°N 75.43°E
Ozhukarai ‡ Puducherry 300,104 217,707 +37.8% 11.9569800°N 79.773700°E
Bihar Sharif Bihar 297,268 232,071 +28.1% 25.197°N 85.518°E
Darbhanga Bihar 296,039 267,348 +10.7% 26.17°N 85.9°E
Panipat Haryana 294,292 261,740 +12.4% 29.39°N 76.97°E
Aizawl ‡ Mizoram 293,416 228,280 +28.5% 23.43°N 92.43°E
Bally West Bengal 293,373 260,906 +12.4% 22.65°N 88.34°E
Dewas Madhya Pradesh 289,550 231,672 +25.0% 22.96°N 76.06°E
Tirupati Andhra Pradesh 287,482 228,202 +26.0% 13.6355°N 79.4236°E
Ichalkaranji Maharashtra 287,353 257,610 +11.5% 16.7°N 74.47°E
Karnal Haryana 286,827 210,476 +36.3% 29.68°N 76.98°E
Bathinda Punjab 285,788 217,256 +31.5% 30.20°N 74.95°E
Jalna Maharashtra 285,577 235,795 +21.1% 19.83°N 75.88°E
Kirari Suleman Nagar Delhi 283,211 153,874 +84.1% 28.69565°N 77.06533°E
Purnia Bihar 282,248 171,687 +64.4% 25.78°N 87.47°E
Satna Madhya Pradesh 280,222 225,464 +24.3% 24.16°N 80.83°E
Maunath Bhanjan Uttar Pradesh 278,745 212,657 +31.1% 25.94167°N 83.56111°E
Barasat West Bengal 278,435 231,515 +20.3% 22.72°N 88.48°E
Sonipat Haryana 278,149 214,974 +29.4% 28.98°N 77.02°E
Farrukhabad Uttar Pradesh 276,581 228,333 +21.1% 27.37°N 79.63°E
Sagar Madhya Pradesh 273,296 232,133 +17.7% 23.83°N 78.71°E
Rourkela Odisha 272,721 224,601 +21.4% 22.24917°N 84.88278°E
Durg Chhattisgarh 268,806 232,517 +15.6% 21.19°N 81.28°E
Imphal ‡ Manipur 268,243 221,492 +21.1% 24.82°N 93.95°E
Ratlam Madhya Pradesh 264,914 222,202 +19.2% 23.31667°N 75.06667°E
Hapur Uttar Pradesh 262,983 211,983 +24.1% 28.72°N 77.78°E
Arrah Bihar 261,430 203,380 +28.5% 25.55750°N 84.67°E
Karimnagar Telangana 261,185 205,653 +27.0% 18.43694°N 79.12417°E
Anantapur Andhra Pradesh 261,004 218,808 +19.3% 14.68°N 77.6°E
New Delhi ‡ Delhi 257,803 302,147 −14.7% 28.61389°N 77.20889°E
Etawah Uttar Pradesh 256,838 210,453 +22.0% 26.77°N 79.03°E
Ambarnath Maharashtra 253,475 203,795 +24.4% 19.209°N 73.186°E
Bharatpur Rajasthan 252,342 204,587 +23.3% 27.22°N 77.48°E
Begusarai Bihar 252,008 93,378 +169.9% 25.42°N 86.13°E
Tiruvottiyur Tamil Nadu 249,446 212,281 +17.5% 13.16°N 80.3°E
North Dumdum West Bengal 249,142 220,042 +13.2% 22.6520800°N 88.4190700°E
Gandhidham Gujarat 247,992 166,388 +49.0% 23.08°N 70.13°E
Baranagar West Bengal 245,213 250,768 −2.2% 22.64°N 88.37°E
Puducherry ‡ Puducherry 244,377 220,749 +10.7% 11.930965°N 79.785182°E
Thoothukudi Tamil Nadu 237,830 216,058 +10.1% 8.7625°N 78.134218°E
Sikar Rajasthan 237,532 184,904 +28.5% 27.62°N 75.15°E
Rewa Madhya Pradesh 235,654 183,274 +28.6% 24.53°N 81.3°E
Mirzapur Uttar Pradesh 234,871 205,053 +14.5% 25.15°N 82.58°E
Raichur Karnataka 234,073 207,421 +12.8% 16.2°N 77.37°E
Pali Rajasthan 230,075 187,641 +22.6% 25.77°N 73.33°E
Ramagundam Telangana 229,644 236,600 −2.9% 18.8000°N 79.4500°E
Haridwar Uttarakhand 228,832 175,010 +30.8% 29.956°N 78.17°E
Vijayanagaram Andhra Pradesh 228,025 174,324 +30.8% 18.12°N 83.42°E
Katihar Bihar 226,261 175,169 +29.2% 25.53°N 87.58°E
Nagercoil Tamil Nadu 224,849 208,179 +8.0% 8.17899°N 77.43227°E
Sri Ganganagar Rajasthan 224,532 210,713 +6.6% 29.92°N 73.88°E
Karawal Nagar Delhi 224,281 148,549 +51.0% 28.727122°N 77.270473°E
Mango Jharkhand 223,805 166,125 +34.7% 22.82750°N 86.21639°E
Thanjavur Tamil Nadu 222,943 215,314 +3.5% 10.7870°N 79.1378°E
Bulandshahr Uttar Pradesh 222,519 176,425 +26.1% 28.406°N 77.8498°E
Uluberia West Bengal 222,240 202,135 +9.9% 22.47°N 88.1011°E
Murwara Madhya Pradesh 221,883 187,029 +18.6% 23.837757°N 80.394047°E
Sambhal Uttar Pradesh 220,813 182,478 +21.0% 28.5852°N 78.5708°E
Singrauli Madhya Pradesh 220,257 185,190 +18.9% 24.19899°N 82.66765°E
Nadiad Gujarat 218,095 192,913 +13.1% 22.7°N 72.87°E
Secunderabad Telangana 217,910 206,102 +5.7% 17.45°N 78.50°E
Naihati West Bengal 217,900 215,303 +1.2% 22.893956°N 88.415205°E
Yamunanagar Haryana 216,677 189,696 +14.2% 30.1294°N 77.2674°E
Bidhan Nagar West Bengal 215,514 164,221 +31.2% 22.58°N 88.42°E
Pallavaram Tamil Nadu 215,417 144,623 +49.0% 12.967696°N 80.158073°E
Bidar Karnataka 214,373 172,877 +24.0% 17.9°N 77.55°E
Panchkula Haryana 211,355 140,925 +50.0% 30.6942°N 76.8606°E
Burhanpur Madhya Pradesh 210,886 193,725 +8.9% 21.30868°N 76.230258°E
Raurkela Industrial Township Odisha 210,317 206,693 +1.8% 22.2322°N 84.8812°E
Kharagpur West Bengal 207,604 188,761 +10.0% 22.33971°N 87.32501°E
Dindigul Tamil Nadu 207,327 196,955 +5.3% 10.368958°N 77.980356°E
Gandhinagar ‡ Gujarat 206,167 195,985 +5.2% 23.216667°N 72.683333°E
Hospet Karnataka 206,167 164,240 +25.5% 15.2665°N 76.3872°E
Nangloi Jat Delhi 205,596 150,948 +36.2% 28.679568°N 77.067994°E
Malda West Bengal 205,521 161,456 +27.3% 25.004444°N 88.145833°E
Ongole Andhra Pradesh 204,746 150,471 +36.1% 15.5057°N 80.0499°E
Eluru Andhra Pradesh 203,780 190,347 +7.1% 16.71°N 81.12°E
Deoghar Jharkhand 203,123 112,525 +80.5% 24.28°N 86.41°E
Chapra Bihar 202,352 79,190 +155.5% 25.7848°N 84.7274°E
Haldia West Bengal 200,827 170,673 +17.7% 22.03°N 88.06°E
Khandwa Madhya Pradesh 200,738 172,242 +16.5% 21.82168°N 76.34826°E
Puri Odisha 200,564 — — 19.798254°N 85.824938°E
Nandyal Andhra Pradesh 200,516 152,676 +31.3% 15.47°N 78.48°E
Morena Madhya Pradesh 200,482 150,959 +32.8% 26.498918°N 77.995344°E
Amroha Uttar Pradesh 198,471 165,129 +20.2% 28.9031°N 78.4675°E
Anand Gujarat 198,282 130,685 +51.7% 22.5645°N 72.9289°E
Bhind Madhya Pradesh 197,585 153,752 +28.5% 26.56°N 78.78°E
Bhalswa Jahangir Pur Delhi 197,148 152,339 +29.4% 28.735556°N 77.163889°E
Madhyamgram West Bengal 196,127 155,451 +26.2% 22.69243°N 88.46551°E
Bhiwani Haryana 196,057 169,531 +15.6% 28.78°N 76.13°E
Panvel Maharashtra 195,373 104,058 +87.8% 18.988775°N 73.110128°E
Baharampur West Bengal 195,223 160,143 +21.9% 24.0988°N 88.2676°E
Ambala Haryana 195,153 139,279 +40.1% 30.360993°N 76.797819°E
Morvi Gujarat 194,947 145,719 +33.8% 22.8116°N 70.8230°E
Fatehpur Uttar Pradesh 193,193 151,757 +27.3% 25.927739°N 80.81266°E
Raebareli Uttar Pradesh 191,316 169,333 +13.0% 26.230898°N 81.233152°E
Khora Uttar Pradesh 190,005 — — 28.6692°N 77.4279°E
Chittoor Andhra Pradesh 189,332 152,654 +24.0% 13.2172°N 79.1003°E
Bhusawal Maharashtra 187,421 172,372 +8.7% 21.05°N 75.77°E
Orai Uttar Pradesh 187,137 139,318 +34.3% 25.990234°N 79.453344°E
Bahraich Uttar Pradesh 186,223 168,323 +10.6% 27.57°N 81.59°E
Vellore Tamil Nadu 185,803 177,230 +4.8% 12.9165°N 79.1325°E
Veraval Gujarat 185,797 141,250 +31.5% 20.915°N 70.362°E
Mahesana Gujarat 184,991 141,453 +30.8% 23.6°N 72.4°E
Khammam Telangana 184,210 218,689 −15.8% 17.24°N 80.15°E
Sambalpur Odisha 184,000 153,643 +19.8% 21.465268°N 83.975731°E
Raiganj West Bengal 183,612 165,212 +11.1% 25.6138°N 88.1245°E
Sirsa Haryana 182,534 160,735 +13.6% 29.5349°N 75.0290°E
Danapur Bihar 182,429 131,176 +39.1% 25.623962°N 85.041432°E
Serampore West Bengal 181,842 197,857 −8.1% 22.75°N 88.34°E
Sultan Pur Majra Delhi 181,554 164,426 +10.4% 28.689664°N 77.076484°E
Guna Madhya Pradesh 180,935 137,175 +31.9% 24.6469°N 77.3110°E
Jaunpur Uttar Pradesh 180,362 160,055 +12.7% 25.7460°N 82.6836°E
Shivpuri Madhya Pradesh 179,977 146,892 +22.5% 25.4358°N 77.7398°E
Surendranagar Dudhrej Gujarat 177,851 156,161 +13.9% 22.731986°N 71.633906°E
Unnao Uttar Pradesh 177,658 144,662 +22.8% 26.5470°N 80.4878°E
Hugli-Chuchura West Bengal 177,259 170,201 +4.1% 22.9°N 88.39°E
Sitapur Uttar Pradesh 177,234 — — 27.57°N 80.67°E
Hastsal Delhi 176,877 — — 28.6568°N 77.0572°E
Tambaram Tamil Nadu 174,787 — — 12.9249°N 80.1000°E
Adityapur Jharkhand 174,355 — — 22.8046°N 86.1627°E
Badlapur Maharashtra 174,226 97,948 +77.9% 19.1551°N 73.2654°E
Alappuzha Kerala 174,176 177,029 −1.6% 9.4981°N 76.3388°E
Cuddalore Tamil Nadu 173,636 — — 11.756169°N 79.76693°E
Silchar Assam 172,830 — — 24.82°N 92.8°E
Gadag-Betageri Karnataka 172,612 — — 15.42250°N 75.62571°E
Bahadurgarh Haryana 170,767 — — 28.68°N 76.92°E
Machilipatnam Andhra Pradesh 169,892 179,353 −5.3% 16.187°N 81.137°E
Shimla ‡ Himachal Pradesh 169,578 142,555 +19.0% 31.104°N 77.1708°E
Medinipur West Bengal 169,264 — — 22.4250°N 87.3190°E
Deoli Delhi 169,122 — — 28.502539°N 77.231173°E
Bharuch Gujarat 169,007 — — 21.7051°N 72.9959°E
Hoshiarpur Punjab 168,653 — — 31.5320°N 75.9180°E
Jind Haryana 167,592 — — 29.30863°N 76.33842°E
Chandannagar West Bengal 166,867 — — 22.86646°N 88.35485°E
Adoni Andhra Pradesh 166,344 — — 15.63°N 77.27°E
Tonk Rajasthan 165,294 — — 26.15657°N 75.78194°E
Faizabad Uttar Pradesh 165,228 — — 26.775486°N 82.150182°E
Tenali Andhra Pradesh 164,937 — — 16.239°N 80.645°E
Alandur Tamil Nadu 164,430 — — 12.997500°N 80.200600°E
Kancheepuram Tamil Nadu 164,384 — — 12.8300°N 79.7100°E
Vapi Gujarat 163,630 — — 20.36381°N 72.92290°E
Rajnandgaon Chhattisgarh 163,114 — — 21.0976°N 81.0337°E
Proddatur Andhra Pradesh 162,717 — — 14.7526°N 78.5541°E
Navsari Gujarat 160,941 — — 20.94237°N 72.92467°E
Budaun Uttar Pradesh 159,285 — — 28.038114°N 79.126677°E
Uttarpara Kotrung West Bengal 159,147 — — 22.676846°N 88.338509°E
Mahbubnagar Andhra Pradesh 157,733 — — 16.74892°N 77.99489°E
Erode Tamil Nadu 157,101 173,600 −9.5% 11.21°N 77.44°E
Batala Punjab 156,619 — — 31.8186°N 75.2029°E
Saharsa Bihar 156,540 125,167 +25.1% 25.88°N 86.60°E
Haldwani-Kathgodam Uttarakhand 156,078 — — 29.2183°N 79.5130°E
Vidisha Madhya Pradesh 155,951 125,453 +24.3% 23.526037°N 77.810925°E
Thanesar Haryana 155,152 — — 29.9690°N 76.8783°E
Kishangarh Rajasthan 154,886 — — 26.60250°N 74.85706°E
Hindupur Andhra Pradesh 151,835 — — 13.8223°N 77.5009°E
Sasaram Bihar 147,396 131,172 +12.4% 24.95°N 84.03°E
Hajipur Bihar 147,126 119,412 +23.2% 25.69°N 85.20°E
Beed Maharashtra 146,709 138,196 +6.2% 18.9891°N 75.7601°E
Bhimavaram Andhra Pradesh 142,280 — — 16.544°N 81.524°E
Dehri Bihar 137,068 119,057 +15.1% 24.91°N 84.18°E
Madanapalle Andhra Pradesh 135,669 — — 13.5560°N 78.5010°E
Siwan Bihar 134,458 109,919 +22.3% 26.22°N 84.36°E
Bettiah Bihar 132,896 116,670 +13.9% 26.80°N 84.51°E
Gondia Maharashtra 132,813 120,902 +9.9% 21.4624°N 80.2210°E
Guntakal Andhra Pradesh 126,270 — — 15.1670°N 77.3667°E
Srikakulam Andhra Pradesh 125,939 — — 18.2969°N 83.8968°E
Motihari Bihar 125,183 100,683 +24.3% 26.64°N 84.90°E
Dharmavaram Andhra Pradesh 121,874 — — 14.4149°N 77.7214°E
Satara Maharashtra 120,195 108,048 +11.2% 17.688°N 74.006°E
Barshi Maharashtra 118,722 104,785 +13.3% 18.2342°N 75.6950°E
Gudivada Andhra Pradesh 118,167 — — 16.434°N 80.993°E
Yavatmal Maharashtra 116,551 120,676 −3.4% 20.3888°N 78.1204°E
Narasaraopet Andhra Pradesh 116,250 — — 16.236111°N 80.053889°E
Bagaha Bihar 113,012 91,467 +23.6% 27.0990°N 84.0900°E
Achalpur Maharashtra 112,311 107,316 +4.7% 21.2575°N 77.5100°E
Osmanabad Maharashtra 111,825 80,625 +38.7% 18.181584°N 76.038895°E
Nandurbar Maharashtra 111,037 94,368 +17.7% 21.3667°N 74.2500°E
Miryalaguda Telangana 109,891 91,395 +20.2% 16.86°N 79.58°E
Tadipatri Andhra Pradesh 108,171 — — 14.908321°N 78.010313°E
Kishanganj Bihar 107,076 85,590 +25.1% 26.09°N 87.93°E
Karaikudi Tamil Nadu 106,714 86,596 +23.2% 10.0730°N 78.7808°E
Wardha Maharashtra 106,444 111,118 −4.2% 20.7453°N 78.6022°E
Suryapet Telangana 105,250 94,585 +11.3% 17.140537°N 79.620445°E
Jamalpur Bihar 105,221 96,983 +8.5% 25.31°N 86.49°E
Kavali Andhra Pradesh 104,000 — — 14.9132°N 79.9930°E
Tadepalligudem Andhra Pradesh 103,906 — — 16.808°N 81.531°E
Udgir Maharashtra 103,550 91,933 +12.6% 18.3920°N 77.1170°E
Amaravati ‡ Andhra Pradesh 103,000 — — 16.541°N 80.515°E
Buxar Bihar 102,591 83,168 +23.4% 25.56°N 83.98°E
Jehanabad Bihar 102,456 81,503 +25.7% 25.22°N 84.99°E
Greater Noida Uttar Pradesh 102,054 — — 28.4744°N 77.5040°E
Hinganghat Maharashtra 101,805 92,342 +10.2% 20.5480°N 78.8390°E
Aurangabad Bihar 101,520 79,393 +27.9% 24.75°N 84.37°E
`.trim();

const KNOWN_STATES_DESC = [
  'Jammu and Kashmir',
  'Himachal Pradesh',
  'Arunachal Pradesh',
  'Andhra Pradesh',
  'Madhya Pradesh',
  'Uttar Pradesh',
  'West Bengal',
  'Tamil Nadu',
  'Chhattisgarh',
  'Maharashtra',
  'Uttarakhand',
  'Puducherry',
  'Chandigarh',
  'Karnataka',
  'Telangana',
  'Rajasthan',
  'Jharkhand',
  'Haryana',
  'Gujarat',
  'Mizoram',
  'Manipur',
  'Tripura',
  'Odisha',
  'Punjab',
  'Kerala',
  'Bihar',
  'Assam',
  'Delhi',
  'Goa',
  'Sikkim',
  'Nagaland',
  'Meghalaya',
];

function slugifyCity(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(town\)/g, '')
    .replace(/[–—]/g, '-')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCities(): RawCensusCity[] {
  const lines = RAW_CITY_LINES.split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const usedSlugs = new Set<string>();
  const result: RawCensusCity[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const m = line.match(
      /^(.+?)\s+([\d,]+)\s+([\d,—]+)\s+([+\-−]?[\d.]+%|—)\s+([\d.]+)°N\s+([\d.]+)°E$/,
    );
    if (!m) {
      throw new Error(`Failed to parse city line ${idx + 1}: ${line}`);
    }
    const [, prefix, pop2011Raw, pop2001Raw, changeRaw, latStr, lonStr] = m;

    let matchedState = '';
    let cityRaw = '';
    for (const st of KNOWN_STATES_DESC) {
      if (prefix.endsWith(` ${st}`)) {
        matchedState = st;
        cityRaw = prefix.slice(0, prefix.length - st.length).trim();
        break;
      }
    }
    if (!matchedState) {
      throw new Error(`Unknown state in city line ${idx + 1}: ${prefix}`);
    }

    const isCapital = cityRaw.includes('‡');
    const name = cityRaw.replace(/‡/g, '').replace(/\s+/g, ' ').trim();
    let slug = slugifyCity(name);
    if (usedSlugs.has(slug)) {
      slug = `${slug}-${slugifyCity(matchedState)}`;
    }
    usedSlugs.add(slug);

    const census2011 = Number(pop2011Raw.replace(/,/g, ''));
    const census2001 = pop2001Raw === '—' ? null : Number(pop2001Raw.replace(/,/g, ''));
    const changePct = changeRaw === '—' ? '' : changeRaw;

    result.push({
      rank: idx + 1,
      name,
      slug,
      stateName: matchedState,
      isCapital,
      census2011,
      census2001,
      changePct,
      lat: Number(latStr),
      lon: Number(lonStr),
    });
  }

  return result;
}

export const CENSUS_CITIES: RawCensusCity[] = parseCities();
