//  let number=prompt("enter a number");
//  if(number%5===0){
//     console.log( number,"which is multiple of  5");

//  }
//  else{
//     console.log( number, "which is not multuiple of  5");
// }
 
 
 let marks=prompt("enter the marks");
 marks=Number(marks);
 let grade;

if(marks>=90 && marks<=100)
{
    grade=" A";

}
else if(marks>=70 && marks<=89)
    {
      grade= "B";
}
else if(marks>=60 && marks<=69){
    grade ="C";
}
else if(marks>=50 && marks<=59){
    grade= "D";
}
else if(marks>=0 && marks<=49){
    grade="F";
}
console.log("According to your marks ,your grade was =",grade);